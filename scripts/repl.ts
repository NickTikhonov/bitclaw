import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC_POLL_MS, type BitclawPaths } from '../src/config.js';
import { loadProjectEnv } from '../src/env.js';
import { receiveFromAgent, sendToAgent } from '../src/ipc.js';
import { restartContainer, stopContainer } from '../src/runtime.js';
import { formatOutboundEvent, isExitCommand, isHelpCommand, isRestartCommand } from './repl-utils.js';

function startBackgroundPoller(paths: BitclawPaths): { stop: () => void } {
  let running = true;

  const poll = async () => {
    while (running) {
      try {
        await receiveFromAgent(paths, async (event) => {
          const text = formatOutboundEvent(event);
          if (text) console.log(text);
        });
      } catch {
        // Swallow transient FS errors; poller will retry next tick.
      }
      await new Promise((resolve) => setTimeout(resolve, IPC_POLL_MS));
    }
  };

  poll();
  return { stop: () => { running = false; } };
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
  const started = restartContainer(projectRoot);
  const paths = started.paths;

  // Flush any old outbound events so each run starts clean.
  await receiveFromAgent(paths, async () => undefined);

  const poller = startBackgroundPoller(paths);
  const rl = createInterface({ input: stdin, output: stdout });

  const cleanup = () => {
    poller.stop();
    try { stopContainer(); } catch { /* not fatal */ }
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
        restartContainer(projectRoot);
        continue;
      }
      if (isExitCommand(trimmed)) {
        break;
      }

      sendToAgent(paths, {
        type: 'messages',
        text: trimmed,
        timestamp: new Date().toISOString(),
      });
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
