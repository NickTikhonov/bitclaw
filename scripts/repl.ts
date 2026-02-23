import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBitclawPaths, IPC_POLL_MS } from '../src/config.js';
import { loadProjectEnv } from '../src/env.js';
import { pollOutbound, sendInbound } from '../src/ipc.js';
import {
  formatOutboundEvent,
  isExitCommand,
  isHelpCommand,
  isRestartCommand,
  shouldStopWaitingForTurn,
} from '../src/repl-utils.js';

const TURN_MAX_WAIT_MS = 90_000;
const TURN_SETTLE_MS = 1_000;

function runNpmScript(script: string): void {
  const result = spawnSync('npm', ['run', script], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`Failed running npm script: ${script}`);
  }
}

async function waitForTurnResponses(): Promise<number> {
  const paths = createBitclawPaths();
  const startMs = Date.now();
  let firstResponseMs: number | null = null;
  let lastResponseMs: number | null = null;
  let sawResult = false;
  let count = 0;

  while (true) {
    await pollOutbound(paths, async (event) => {
      count += 1;
      const now = Date.now();
      if (firstResponseMs == null) firstResponseMs = now;
      lastResponseMs = now;
      if (event.type === 'result') sawResult = true;
      console.log(formatOutboundEvent(event));
    });

    const nowMs = Date.now();
    const hardTimedOut = nowMs - startMs >= TURN_MAX_WAIT_MS;
    if (hardTimedOut) {
      break;
    }

    // Do not end a turn before a result arrives; tool_call events can precede
    // the final result by several seconds for slower tools like WebFetch.
    if (!sawResult) {
      await new Promise((resolve) => setTimeout(resolve, IPC_POLL_MS));
      continue;
    }

    if (
      shouldStopWaitingForTurn({
        startMs,
        nowMs,
        firstResponseMs,
        lastResponseMs,
        maxWaitMs: TURN_MAX_WAIT_MS,
        settleAfterMs: TURN_SETTLE_MS,
      })
    ) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, IPC_POLL_MS));
  }

  return count;
}

function printHelp(): void {
  console.log('Commands:');
  console.log('  /help     show help');
  console.log('  /restart  restart container');
  console.log('  /exit     quit chat and stop container');
}

async function main(): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const projectRoot = path.resolve(path.join(currentDir, '..'));
  loadProjectEnv(projectRoot);

  console.log('Starting container...');
  runNpmScript('container:start');

  const paths = createBitclawPaths();
  // Flush any old outbound events so each run starts clean.
  await pollOutbound(paths, async () => undefined);

  const rl = createInterface({ input: stdin, output: stdout });

  const cleanup = () => {
    try {
      runNpmScript('container:stop');
    } catch {
      // Keep exit path simple; stop failures are not fatal for TUI shutdown.
    }
  };

  process.on('SIGINT', () => {
    console.log('\nStopping container...');
    cleanup();
    process.exit(0);
  });

  console.log('\nBitclaw chat ready. Type /help for commands.\n');

  try {
    while (true) {
      const input = await rl.question('you> ').catch(() => null);
      if (input == null) break;
      const trimmed = input.trim();
      if (!trimmed) continue;

      if (isHelpCommand(trimmed)) {
        printHelp();
        continue;
      }
      if (isRestartCommand(trimmed)) {
        console.log('Restarting container...');
        runNpmScript('container:start');
        continue;
      }
      if (isExitCommand(trimmed)) {
        break;
      }

      sendInbound(paths, {
        type: 'messages',
        text: trimmed,
        timestamp: new Date().toISOString(),
      });

      const count = await waitForTurnResponses();
      if (count === 0) {
        console.log('[agent] (no response yet)');
      }
    }
  } finally {
    rl.close();
    cleanup();
  }
}
main().catch((err) => {
  console.error(`[chat] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

