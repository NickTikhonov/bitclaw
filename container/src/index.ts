import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  query,
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

type InboundType = 'messages' | 'task' | 'heartbeat' | 'shutdown';

interface InboundEnvelope {
  type: InboundType;
  timestamp: string;
  text?: string;
  prompt?: string;
  taskId?: string;
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

const POLL_MS = 400;
const WORKSPACE_DIR = '/workspace/workspace';
const SECRET_ENV_VARS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];
const SESSION_STATE_FILE = '/home/node/.claude/bitclaw-session.json';

const SYSTEM_PROMPT = `You are BitClaw, a smart AI agent.

## Files you have access to:

- working directory: /workspace/workspace

## Instructions

- Read AGENT.md in your working directory to understand your purpose and how to behave. You can edit this file when the user asks you to behave differently.
- You have full filesystem access within /workspace/workspace. Use it to store notes, code, or any artifacts.
- You can run shell commands via Bash, read/write/edit files, search the web, and use MCP tools.
- Be direct and efficient. Avoid unnecessary preamble.

## How messages work

Your final response text is automatically delivered to the user — just write your answer normally.
Only use the send_message tool if you need to share a progress update WHILE you are still working on a longer task (e.g. "Searching your emails now..." or "Found 3 results, summarizing..."). Do not use send_message for your final answer.

## Tasks

You can create recurring and one-shot tasks using MCP tools. Tasks are stored as JSON files in /workspace/workspace/tasks/.

- create_task: schedule a new task (5-field cron expression for recurring, ISO date for one-shot)
- list_tasks: list all tasks with their schedules and prompts
- read_task: read the full definition of a specific task
- edit_task: update the schedule or prompt of an existing task
- delete_task: remove a task

Examples:
- Recurring: create_task(name="daily-email-check", schedule="0 9 * * *", prompt="Check my emails and summarize them")
- One-shot: create_task(name="remind-meeting", schedule="2026-03-01T14:00:00Z", prompt="Remind me about the team meeting")

One-shot tasks are automatically deleted after they fire. The host checks for due tasks every 60 seconds.`;

let sessionId: string | undefined;
let resumeAt: string | undefined;

interface SessionState {
  sessionId?: string;
  resumeAt?: string;
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
  console.error(`[bitclaw-agent-runner] ${message}`);
}

async function readBootstrapFromStdin(timeoutMs = 300): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const settle = (value: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => settle(data), timeoutMs);
    });
    process.stdin.on('end', () => settle(data));
    process.stdin.on('error', () => settle(data));

    timer = setTimeout(() => settle(data), timeoutMs);
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
    if (typeof parsed.resumeAt === 'string' && parsed.resumeAt.length > 0) {
      resumeAt = parsed.resumeAt;
    }
    if (sessionId || resumeAt) {
      log(`Loaded persistent session state (sessionId: ${sessionId ? 'yes' : 'no'}, resumeAt: ${resumeAt ? 'yes' : 'no'})`);
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
      resumeAt,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(payload, null, 2));
  } catch (err) {
    log(`Failed to save session state: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function parseMcpToolName(toolName: string): { isMcp: boolean; mcpServer?: string; mcpTool?: string } {
  if (!toolName.startsWith('mcp__')) {
    return { isMcp: false };
  }

  const parts = toolName.split('__');
  if (parts.length < 3) {
    return { isMcp: true };
  }

  return {
    isMcp: true,
    mcpServer: parts[1],
    mcpTool: parts.slice(2).join('__'),
  };
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

async function runClaudeQuery(
  prompt: string,
  sdkEnv: Record<string, string | undefined>,
  isolated: boolean,
  externalMcpServers: Record<string, McpServerBootstrap>,
): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');
  let latestResult: string | null = null;

  // Build allowed tool patterns for external MCP servers
  const externalMcpToolPatterns = Object.keys(externalMcpServers).map((name) => `mcp__${name}__*`);

  let lastTypingAt = 0;
  const TYPING_THROTTLE_MS = 1000;

  for await (const message of query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      cwd: WORKSPACE_DIR,
      resume: isolated ? undefined : sessionId,
      resumeSessionAt: isolated ? undefined : resumeAt,
      allowedTools: [
        'Bash',
        'Read',
        'Write',
        'Edit',
        'Glob',
        'Grep',
        'WebSearch',
        'WebFetch',
        'Task',
        'TaskOutput',
        'TaskStop',
        'TeamCreate',
        'TeamDelete',
        'SendMessage',
        'TodoWrite',
        'ToolSearch',
        'Skill',
        'NotebookEdit',
        'mcp__nanoclaw__*',
        ...externalMcpToolPatterns,
      ],
      env: sdkEnv,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['project', 'user'],
      mcpServers: {
        nanoclaw: {
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
  })) {
    // Emit throttled typing events (at most 1 per second)
    const now = Date.now();
    if (now - lastTypingAt >= TYPING_THROTTLE_MS) {
      sendEventToHost({ type: 'typing', timestamp: new Date().toISOString() });
      lastTypingAt = now;
    }

    const toolCalls = extractToolCalls(message);
    for (const toolCall of toolCalls) {
      sendEventToHost({
        type: 'tool_call',
        toolName: toolCall.toolName,
        toolUseId: toolCall.toolUseId,
        isMcp: toolCall.isMcp,
        mcpServer: toolCall.mcpServer,
        mcpTool: toolCall.mcpTool,
        timestamp: new Date().toISOString(),
      });
    }

    if (message.type === 'system' && message.subtype === 'init' && !isolated) {
      sessionId = message.session_id;
      saveSessionState();
    }
    if (message.type === 'assistant' && 'uuid' in message && !isolated) {
      resumeAt = message.uuid;
      saveSessionState();
    }
    if (message.type === 'result') {
      latestResult = 'result' in message && typeof message.result === 'string'
        ? message.result
        : null;
      sendEventToHost({
        type: 'result',
        status: 'success',
        result: latestResult,
        sessionId: isolated ? undefined : sessionId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (!isolated) {
    saveSessionState();
  }
}

async function processInbound(
  inbound: InboundEnvelope,
  sdkEnv: Record<string, string | undefined>,
  externalMcpServers: Record<string, McpServerBootstrap>,
): Promise<{ shouldStop: boolean }> {
  if (inbound.type === 'shutdown') {
    return { shouldStop: true };
  }

  if (inbound.type === 'messages') {
    if (!sdkEnv.ANTHROPIC_API_KEY && !sdkEnv.CLAUDE_CODE_OAUTH_TOKEN) {
      throw new Error('Missing Claude auth credentials (ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN)');
    }
    await runClaudeQuery(inbound.text ?? '', sdkEnv, false, externalMcpServers);
    return { shouldStop: false };
  }

  if (inbound.type === 'task') {
    if (!sdkEnv.ANTHROPIC_API_KEY && !sdkEnv.CLAUDE_CODE_OAUTH_TOKEN) {
      throw new Error('Missing Claude auth credentials (ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN)');
    }
    await runClaudeQuery(inbound.prompt ?? '', sdkEnv, true, externalMcpServers);
    return { shouldStop: false };
  }

  if (inbound.type === 'heartbeat') {
    if (!sdkEnv.ANTHROPIC_API_KEY && !sdkEnv.CLAUDE_CODE_OAUTH_TOKEN) {
      throw new Error('Missing Claude auth credentials (ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN)');
    }
    await runClaudeQuery(inbound.prompt ?? 'heartbeat', sdkEnv, true, externalMcpServers);
    return { shouldStop: false };
  }

  throw new Error(`Unsupported inbound type: ${inbound.type}`);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  fs.mkdirSync(INBOUND_DIR, { recursive: true });
  fs.mkdirSync(OUTBOUND_DIR, { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

  const stdin = await readBootstrapFromStdin();
  const bootstrap: BootstrapInput = stdin.trim() ? JSON.parse(stdin) : {};
  const sdkEnv = buildSdkEnv(bootstrap.secrets ?? {});
  const externalMcpServers = bootstrap.mcpServers ?? {};
  if (Object.keys(externalMcpServers).length > 0) {
    log(`External MCP servers: ${Object.keys(externalMcpServers).join(', ')}`);
  }
  loadSessionState();

  let shouldStop = false;
  while (!shouldStop) {
    const inboundFiles = listInboundMessagesSorted();
    for (const filePath of inboundFiles) {
      try {
        const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as InboundEnvelope;
        const result = await processInbound(payload, sdkEnv, externalMcpServers);
        archiveMessage(filePath);
        if (result.shouldStop) {
          shouldStop = true;
          break;
        }
      } catch (err) {
        sendEventToHost({
          type: 'result',
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          result: null,
          timestamp: new Date().toISOString(),
        });
        archiveMessage(filePath);
      }
    }
    if (!shouldStop) {
      await sleep(POLL_MS);
    }
  }
}

main().catch((err) => {
  log(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
