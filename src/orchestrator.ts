import path from 'node:path';
import { IPC_POLL_MS, type BitclawPaths } from './config.js';
import { checkAndFireTasks, ensureTasksDir } from './cron.js';
import { formatOutboundEvent } from './format.js';
import { receiveFromAgent, sendToAgent } from './ipc.js';
import { ensureContainer, restartContainer, stopContainer } from './runtime.js';
import { generateStatus } from './status.js';
import type { Channel } from './types.js';

const RESTART_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const TASK_POLL_MS = 60_000; // 60 seconds
const TYPING_TIMEOUT_MS = 10_000; // 10 seconds safety net

export interface OrchestratorOptions {
  channel: Channel;
  projectRoot: string;
}

export class Orchestrator {
  private channel: Channel;
  private projectRoot: string;
  private paths: BitclawPaths | null = null;
  private polling = false;
  private restartTimer: ReturnType<typeof setInterval> | null = null;
  private taskTimer: ReturnType<typeof setInterval> | null = null;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastTaskMinute = '';

  constructor(opts: OrchestratorOptions) {
    this.channel = opts.channel;
    this.projectRoot = opts.projectRoot;
  }

  async start(): Promise<void> {
    // Wire channel inbound -> agent IPC
    this.channel.onMessage((text) => {
      if (!this.paths) return;
      sendToAgent(this.paths, {
        type: 'messages',
        text,
        timestamp: new Date().toISOString(),
      });
    });

    // Boot container + channel
    this.paths = ensureContainer(this.projectRoot).paths;
    await this.channel.start();

    // Ensure tasks directory exists
    const tasksDir = path.join(this.paths.workspaceDir, 'tasks');
    ensureTasksDir(tasksDir);

    // Start background IPC poller
    this.polling = true;
    this.pollLoop();

    // Start task scheduler (poll every 60s)
    this.taskTimer = setInterval(() => {
      if (!this.paths) return;
      const td = path.join(this.paths.workspaceDir, 'tasks');
      this.lastTaskMinute = checkAndFireTasks(td, this.paths, this.lastTaskMinute);
    }, TASK_POLL_MS);

    console.log('Bitclaw running. Listening for Telegram messages. Ctrl+C to stop.');

    // Auto-restart every 4 hours
    this.restartTimer = setInterval(() => {
      this.restart();
    }, RESTART_INTERVAL_MS);

    // Graceful shutdown
    const onSignal = () => this.stop();
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  }

  private resetTypingTimeout(): void {
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.channel.setTyping(false);
      this.typingTimeout = null;
    }, TYPING_TIMEOUT_MS);
  }

  private clearTypingTimeout(): void {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        await receiveFromAgent(this.paths!, async (event) => {
          // Typing events — toggle presence indicator
          if (event.type === 'typing') {
            this.channel.setTyping(true);
            this.resetTypingTimeout();
            return;
          }

          // Tool call events — generate and show a fun status
          if (event.type === 'tool_call') {
            const toolName = String(event.toolName ?? '');
            if (toolName) {
              this.channel.setToolStatus(generateStatus(toolName));
            }
            return;
          }

          // Result/message events — send to channel (clears typing + replaces status)
          if (event.type === 'result' || event.type === 'message') {
            this.clearTypingTimeout();
          }
          const text = formatOutboundEvent(event);
          if (text) await this.channel.send(text);
        });
      } catch {
        // Swallow transient FS errors; retry next tick.
      }
      await new Promise((r) => setTimeout(r, IPC_POLL_MS));
    }
  }

  private restart(): void {
    const result = restartContainer(this.projectRoot);
    this.paths = result.paths;
  }

  async stop(): Promise<void> {
    this.polling = false;
    this.clearTypingTimeout();
    if (this.restartTimer) {
      clearInterval(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.taskTimer) {
      clearInterval(this.taskTimer);
      this.taskTimer = null;
    }
    await this.channel.stop();
    try { stopContainer(); } catch { /* not fatal */ }
    process.exit(0);
  }
}
