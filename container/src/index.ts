import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  query,
  type Query,
  type HookCallback,
  type PreToolUseHookInput,
} from '@anthropic-ai/claude-agent-sdk';
import {
  ARCHIVE_DIR,
  INBOUND_DIR,
  OUTBOUND_DIR,
  archiveMessage,
  listInboundMessagesSorted,
  sendEventToHost,
} from './ipc-utils.js';

type InboundType = 'messages' | 'task' | 'shutdown';

interface InboundEnvelope {
  type: InboundType;
  timestamp: string;
  text?: string;
  prompt?: string;
  taskId?: string;
}

const POLL_MS = 400;
const WORKSPACE_DIR = '/workspace/workspace';
const SECRET_ENV_VARS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];
const SESSION_STATE_FILE = '/home/node/.claude/bitclaw-session.json';

/** Watchdog: max silence before first meaningful SDK event */
const INIT_TIMEOUT_MS = 60_000;
/** Watchdog: max silence during an active query */
const MID_QUERY_TIMEOUT_MS = 120_000;
/** Watchdog poll interval */
const WATCHDOG_POLL_MS = 10_000;

// ── Graceful shutdown state ──
let shuttingDown = false;
let activeQuery: Query | null = null;
let activeAbort: AbortController | null = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'system-prompt.txt'), 'utf8');

let sessionId: string | undefined;

/** Directory where the Claude CLI stores session JSONL transcripts. */
const SESSION_JSONL_DIR = '/home/node/.claude/projects/-workspace-workspace';

interface SessionState {
  sessionId?: string;
  updatedAt: string;
}

interface ToolCallEvent {
  toolName: string;
  toolUseId?: string;
  isMcp: boolean;
  mcpServer?: string;
  mcpTool?: string;
}

function log(message: string): void {
  console.error(`${new Date().toISOString()} [container] ${message}`);
}

interface McpServerBootstrap {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface BootstrapInput {
  secrets?: Record<string, string>;
  mcpServers?: Record<string, McpServerBootstrap>;
}

async function readConfigFromStdin(): Promise<BootstrapInput> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      const bootstrap: BootstrapInput = data.trim() ? JSON.parse(data) : {};
      resolve(bootstrap);
    });
    process.stdin.on('error', () => {
      const bootstrap: BootstrapInput = data.trim() ? JSON.parse(data) : {};
      resolve(bootstrap);
    });
  });
}

function createSanitizeBashHook(): HookCallback {
  return async (input: unknown) => {
    const preInput = input as PreToolUseHookInput;
    const command = (preInput.tool_input as { command?: string })?.command;
    if (!command) return {};

    const unsetPrefix = `unset ${SECRET_ENV_VARS.join(' ')} 2>/dev/null; `;
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: {
          ...(preInput.tool_input as Record<string, unknown>),
          command: unsetPrefix + command,
        },
      },
    };
  };
}

function buildSdkEnv(secrets: Record<string, string>): Record<string, string | undefined> {
  const sdkEnv: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(secrets)) {
    sdkEnv[key] = value;
  }
  return sdkEnv;
}

function loadSessionState(): void {
  try {
    if (!fs.existsSync(SESSION_STATE_FILE)) return;
    const raw = fs.readFileSync(SESSION_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as SessionState;
    if (typeof parsed.sessionId === 'string' && parsed.sessionId.length > 0) {
      sessionId = parsed.sessionId;
    }
    if (sessionId) {
      log(`Loaded persistent session state (sessionId: yes)`);
    }
  } catch (err) {
    log(`Failed to load session state: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function saveSessionState(): void {
  try {
    fs.mkdirSync(path.dirname(SESSION_STATE_FILE), { recursive: true });
    const payload: SessionState = {
      sessionId,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(payload, null, 2));
  } catch (err) {
    log(`Failed to save session state: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function parseMcpToolName(toolName: string): { isMcp: boolean; mcpServer?: string; mcpTool?: string } {
  if (!toolName.startsWith('mcp__')) return { isMcp: false };
  const parts = toolName.split('__');
  if (parts.length < 3) return { isMcp: true };
  return { isMcp: true, mcpServer: parts[1], mcpTool: parts.slice(2).join('__') };
}

function extractToolCalls(message: unknown): ToolCallEvent[] {
  const msg = message as Record<string, unknown>;
  const results: ToolCallEvent[] = [];

  const pushToolCall = (name: unknown, id: unknown): void => {
    if (typeof name !== 'string' || name.length === 0) return;
    const mcp = parseMcpToolName(name);
    results.push({
      toolName: name,
      toolUseId: typeof id === 'string' ? id : undefined,
      isMcp: mcp.isMcp,
      mcpServer: mcp.mcpServer,
      mcpTool: mcp.mcpTool,
    });
  };

  if (msg.type === 'assistant') {
    const assistantMessage = msg.message as Record<string, unknown> | undefined;
    const content = assistantMessage?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        const typed = block as Record<string, unknown>;
        if (typed.type === 'tool_use') {
          pushToolCall(typed.name, typed.id);
        }
      }
    }
  }

  if (msg.type === 'tool_use') {
    pushToolCall(msg.name, msg.id);
  }

  return results;
}

function clearSession(): void {
  log('Clearing stale session state');
  sessionId = undefined;
  try { fs.unlinkSync(SESSION_STATE_FILE); } catch { /* already gone */ }
}

/**
 * Read the session JSONL and return the UUID of the last "complete" assistant
 * message — one whose stop_reason is "end_turn" (i.e. Claude finished
 * speaking), skipping any dangling tool_use entries left by interrupted
 * queries. This lets the CLI resume from a clean branch tip even if the
 * transcript was corrupted by a watchdog abort or crash.
 */
function getResumeAtFromJsonl(sid: string): string | undefined {
  const jsonlPath = path.join(SESSION_JSONL_DIR, `${sid}.jsonl`);
  if (!fs.existsSync(jsonlPath)) return undefined;

  try {
    const lines = fs.readFileSync(jsonlPath, 'utf-8').trimEnd().split('\n');
    const skipped: string[] = [];

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type !== 'assistant' || typeof entry.uuid !== 'string') continue;

        const stopReason = entry.message?.stop_reason;
        const content = entry.message?.content;
        const toolNames = Array.isArray(content)
          ? content.filter((b: { type: string }) => b.type === 'tool_use').map((b: { name: string }) => b.name)
          : [];
        const textSnippet = Array.isArray(content)
          ? content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('').slice(0, 80)
          : '';

        // Skip assistant messages that ended with a tool call — these may
        // be dangling (tool_result never written). Only anchor on messages
        // where Claude finished its turn naturally.
        if (stopReason !== 'end_turn') {
          skipped.push(`uuid=${entry.uuid.slice(0, 8)} stop=${stopReason} tools=[${toolNames.join(',')}]`);
          continue;
        }

        if (skipped.length > 0) {
          log(`resumeAt: skipped ${skipped.length} assistant message(s): ${skipped.join(' | ')}`);
        }
        log(`resumeAt: anchoring at uuid=${entry.uuid} stop=${stopReason} text="${textSnippet}${textSnippet.length >= 80 ? '…' : ''}"`);
        return entry.uuid;
      } catch { continue; }
    }

    if (skipped.length > 0) {
      log(`resumeAt: skipped ${skipped.length} assistant message(s) but found NO clean anchor: ${skipped.join(' | ')}`);
    }
  } catch (err) {
    log(`Failed to read session JSONL: ${err instanceof Error ? err.message : String(err)}`);
  }
  return undefined;
}

async function runAgentTurn(
  prompt: string,
  sdkEnv: Record<string, string | undefined>,
  externalMcpServers: Record<string, McpServerBootstrap>,
): Promise<void> {
  const turnStart = Date.now();
  const promptPreview = prompt.slice(0, 100).replace(/\n/g, ' ');
  log(`Turn start: "${promptPreview}${prompt.length > 100 ? '…' : ''}"`);

  const TYPING_THROTTLE_MS = 1000;

  let latestResult: string | null = null;
  let lastTypingAt = 0;

  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');
  const externalMcpToolPatterns = Object.keys(externalMcpServers).map((name) => `mcp__${name}__*`);

  let lastEventAt = Date.now();
  let harnessEventInTimeoutPeriod = false;

  const watchdog = setInterval(() => {
    const silentMs = Date.now() - lastEventAt;

    if (!harnessEventInTimeoutPeriod && silentMs > INIT_TIMEOUT_MS) {
      log(`Watchdog: no event after ${(silentMs / 1000).toFixed(0)}s — clearing session`);
      clearSession();
      // Abort the query so the for-await exits instead of hard-killing
      if (activeAbort) activeAbort.abort();
      return;
    }

    if (harnessEventInTimeoutPeriod && silentMs > MID_QUERY_TIMEOUT_MS) {
      log(`Watchdog: SDK silent for ${(silentMs / 1000).toFixed(0)}s mid-query — aborting`);
      if (activeAbort) activeAbort.abort();
      return;
    }
  }, WATCHDOG_POLL_MS);

  // ── AbortController for this query ──
  const abort = new AbortController();
  activeAbort = abort;

  // Derive resumeAt from the actual JSONL on disk (not in-memory state).
  // This ensures we always anchor to the correct branch tip, even after
  // crashes or watchdog aborts that leave dangling tool_use entries.
  const resumeAt = sessionId ? getResumeAtFromJsonl(sessionId) : undefined;
  log(`Resume: session=${sessionId ?? 'new'}, resumeAt=${resumeAt ?? 'none'}`);

  const q = query({
    prompt,
    options: {
      abortController: abort,
      systemPrompt: SYSTEM_PROMPT,
      cwd: WORKSPACE_DIR,
      resume: sessionId,
      resumeSessionAt: resumeAt,
      allowedTools: [
        'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'WebSearch', 'WebFetch', 'Task', 'TaskOutput', 'TaskStop',
        'TeamCreate', 'TeamDelete', 'SendMessage', 'TodoWrite',
        'ToolSearch', 'Skill', 'NotebookEdit',
        'mcp__bitclaw__*',
        ...externalMcpToolPatterns,
      ],
      env: sdkEnv,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['project', 'user'],
      mcpServers: {
        bitclaw: {
          command: 'node',
          args: [mcpServerPath],
          env: {},
        },
        ...externalMcpServers,
      },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [createSanitizeBashHook()] }],
      },
    },
  });
  activeQuery = q;

  try {
    for await (const message of q) {
      lastEventAt = Date.now();
      harnessEventInTimeoutPeriod = true;

      // Emit throttled typing events (at most 1 per second)
      const now = Date.now();
      if (now - lastTypingAt >= TYPING_THROTTLE_MS) {
        sendEventToHost({ type: 'typing', timestamp: new Date().toISOString() });
        lastTypingAt = now;
      }

      if (message.type === 'system' && message.subtype === 'init') {
        sessionId = message.session_id;
        log(`Session init: id=${sessionId}`);
        saveSessionState();
      }

      const toolCalls = extractToolCalls(message);
      if (toolCalls.length > 0) {
        sendEventToHost({
          type: 'tool_calls',
          tools: toolCalls,
          timestamp: new Date().toISOString(),
        });
      }

      if (message.type === 'result') {
        latestResult = 'result' in message && typeof message.result === 'string'
          ? message.result
          : null;
        sendEventToHost({
          type: 'result',
          status: 'success',
          result: latestResult,
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    // AbortError is expected when watchdog or SIGTERM aborts the query
    const isAbort = err instanceof Error && (err.name === 'AbortError' || abort.signal.aborted);
    if (!isAbort) throw err;
    log(`Query aborted${shuttingDown ? ' (shutdown)' : ' (watchdog)'}`);
  } finally {
    clearInterval(watchdog);
    activeQuery = null;
    activeAbort = null;
  }

  const dur = ((Date.now() - turnStart) / 1000).toFixed(1);
  log(`Turn complete: ${dur}s, result=${latestResult ? `${latestResult.length} chars` : 'none'}`);
  saveSessionState();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  fs.mkdirSync(INBOUND_DIR, { recursive: true });
  fs.mkdirSync(OUTBOUND_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const bootConfig = await readConfigFromStdin();
  const sdkEnv = buildSdkEnv(bootConfig.secrets ?? {});
  if (!sdkEnv.ANTHROPIC_API_KEY && !sdkEnv.CLAUDE_CODE_OAUTH_TOKEN) {
    throw new Error('Missing Claude auth credentials (ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN)');
  }
  const externalMcpServers = bootConfig.mcpServers ?? {};
  log(`External MCP servers: ${Object.keys(externalMcpServers).join(', ')}`);

  loadSessionState();

  process.on('SIGTERM', () => {
    log('SIGTERM received — shutting down gracefully');
    shuttingDown = true;

    if (activeAbort) {
      activeAbort.abort();
    }

    sendEventToHost({
      type: 'result',
      status: 'error',
      error: 'Agent is restarting',
      result: null,
      timestamp: new Date().toISOString(),
    });
  });

  let shouldStop = false;
  while (!shouldStop && !shuttingDown) {
    const inboundFiles = listInboundMessagesSorted();
    if (inboundFiles.length === 0) {
      await sleep(POLL_MS);
      continue;
    }

    // Read all pending envelopes
    const pending: { path: string; envelope: InboundEnvelope }[] = [];
    for (const filePath of inboundFiles) {
      try {
        pending.push({ path: filePath, envelope: JSON.parse(fs.readFileSync(filePath, 'utf8')) });
      } catch {
        archiveMessage(filePath);
      }
    }
    if (pending.length === 0) continue;

    const first = pending[0];

    // ── Shutdown ──
    if (first.envelope.type === 'shutdown') {
      archiveMessage(first.path);
      shouldStop = true;
      continue;
    }

    // ── Task: run individually ──
    if (first.envelope.type === 'task') {
      log(`Inbound pickup: type=task taskId=${first.envelope.taskId}`);
      try {
        await runAgentTurn(
          `[Scheduled task: ${first.envelope.taskId}]\n${first.envelope.prompt}`,
          sdkEnv, externalMcpServers,
        );
      } catch (err) {
        sendEventToHost({
          type: 'result', status: 'error',
          error: err instanceof Error ? err.message : String(err),
          result: null, timestamp: new Date().toISOString(),
        });
      }
      archiveMessage(first.path);
      continue;
    }

    // ── User messages: batch all pending messages into one turn ──
    const batch = pending.filter((p) => p.envelope.type === 'messages');
    const combined = batch.map((b) => b.envelope.text ?? '').join('\n\n');
    log(`Inbound pickup: ${batch.length} user message(s) batched, ${combined.length} chars`);
    try {
      await runAgentTurn(combined, sdkEnv, externalMcpServers);
    } catch (err) {
      sendEventToHost({
        type: 'result', status: 'error',
        error: err instanceof Error ? err.message : String(err),
        result: null, timestamp: new Date().toISOString(),
      });
    }
    for (const b of batch) archiveMessage(b.path);
  }

  log('Main loop exited cleanly');
}

main().catch((err) => {
  log(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
