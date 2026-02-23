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
  archiveFile,
  listInboundFilesSorted,
  writeOutbound,
} from './ipc-utils.js';

type InboundType = 'messages' | 'task' | 'heartbeat' | 'shutdown';

interface InboundEnvelope {
  type: InboundType;
  timestamp: string;
  text?: string;
  prompt?: string;
  taskId?: string;
}

interface BootstrapInput {
  secrets?: Record<string, string>;
}

const POLL_MS = Number(process.env.BITCLAW_IPC_POLL_MS ?? 400);
const WORKSPACE_DIR = '/workspace/workspace';
const SECRET_ENV_VARS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];

let sessionId: string | undefined;
let resumeAt: string | undefined;

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
  return async (input) => {
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

async function runClaudeQuery(
  prompt: string,
  sdkEnv: Record<string, string | undefined>,
  isolated: boolean,
): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');
  let latestResult: string | null = null;

  for await (const message of query({
    prompt,
    options: {
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
      },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [createSanitizeBashHook()] }],
      },
    },
  })) {
    if (message.type === 'system' && message.subtype === 'init' && !isolated) {
      sessionId = message.session_id;
    }
    if (message.type === 'assistant' && 'uuid' in message && !isolated) {
      resumeAt = message.uuid;
    }
    if (message.type === 'result') {
      latestResult = 'result' in message && typeof message.result === 'string'
        ? message.result
        : null;
      writeOutbound({
        type: 'result',
        status: 'success',
        result: latestResult,
        sessionId: isolated ? undefined : sessionId,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

async function processInbound(
  inbound: InboundEnvelope,
  sdkEnv: Record<string, string | undefined>,
): Promise<{ shouldStop: boolean }> {
  if (inbound.type === 'shutdown') {
    return { shouldStop: true };
  }

  if (inbound.type === 'messages') {
    if (!sdkEnv.ANTHROPIC_API_KEY && !sdkEnv.CLAUDE_CODE_OAUTH_TOKEN) {
      throw new Error('Missing Claude auth credentials (ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN)');
    }
    await runClaudeQuery(inbound.text ?? '', sdkEnv, false);
    return { shouldStop: false };
  }

  if (inbound.type === 'task') {
    if (!sdkEnv.ANTHROPIC_API_KEY && !sdkEnv.CLAUDE_CODE_OAUTH_TOKEN) {
      throw new Error('Missing Claude auth credentials (ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN)');
    }
    await runClaudeQuery(inbound.prompt ?? '', sdkEnv, true);
    return { shouldStop: false };
  }

  if (inbound.type === 'heartbeat') {
    if (!sdkEnv.ANTHROPIC_API_KEY && !sdkEnv.CLAUDE_CODE_OAUTH_TOKEN) {
      throw new Error('Missing Claude auth credentials (ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN)');
    }
    await runClaudeQuery(inbound.prompt ?? 'heartbeat', sdkEnv, true);
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

  let shouldStop = false;
  while (!shouldStop) {
    const inboundFiles = listInboundFilesSorted();
    for (const filePath of inboundFiles) {
      try {
        const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as InboundEnvelope;
        const result = await processInbound(payload, sdkEnv);
        archiveFile(filePath);
        if (result.shouldStop) {
          shouldStop = true;
          break;
        }
      } catch (err) {
        writeOutbound({
          type: 'result',
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          result: null,
          timestamp: new Date().toISOString(),
        });
        archiveFile(filePath, true);
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
