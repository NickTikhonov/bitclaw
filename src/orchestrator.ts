import path from 'node:path';
import { IPC_POLL_MS, type BitclawPaths } from './config.js';
import { checkAndFireTasks, ensureTasksDir } from './cron.js';
import { formatOutboundEvent } from './format.js';
import { receiveFromAgent, sendToAgent } from './ipc.js';
import { log } from './log.js';
import { startContainer, stopContainer } from './runtime.js';
import { generateStatus } from './status.js';
import type { Channel } from './types.js';

const TASK_POLL_MS = 40_000; // 60 seconds
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
  private taskTimer: ReturnType<typeof setInterval> | null = null;
  private typingTimeout: ReturnType<typeof setTimeout> | null = null;
  constructor(opts: OrchestratorOptions) {
    this.channel = opts.channel;
    this.projectRoot = opts.projectRoot;
  }

  async start(): Promise<void> {
    log(`Starting orchestrator, projectRoot=${this.projectRoot}`);

    // Wire channel inbound -> agent IPC
    this.channel.onMessage((text) => {
      if (!this.paths) return;
      log(`Message received (${text.length} chars), forwarding to agent`);
      sendToAgent(this.paths, {
        type: 'messages',
        text,
        timestamp: new Date().toISOString(),
      });
    });

    // Boot container + channel
    this.paths = startContainer(this.projectRoot).paths;
    log('Container started');
    await this.channel.start();
    log('Channel started, polling for IPC');

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
      checkAndFireTasks(td, this.paths);
    }, TASK_POLL_MS);

    console.log('Bitclaw running. Listening for Telegram messages. Ctrl+C to stop.');

    // Graceful shutdown
    const onSignal = (sig: string) => {
      log(`Received ${sig}, stopping…`);
      this.stop();
    };
    process.on('SIGINT', () => onSignal('SIGINT'));
    process.on('SIGTERM', () => onSignal('SIGTERM'));
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

          // Tool call events — generate and show a fun status for the last tool
          if (event.type === 'tool_calls') {
            const tools = Array.isArray(event.tools) ? event.tools as { toolName?: string }[] : [];
            const names = tools.map((t) => t.toolName ?? '?').join(', ');
            log(`IPC recv: tool_calls [${names}]`);
            const last = tools[tools.length - 1];
            const toolName = typeof last?.toolName === 'string' ? last.toolName : '';
            if (toolName) {
              this.channel.setToolStatus(generateStatus(toolName));
            }
            return;
          }

          // Result/message events — send to channel (clears typing + replaces status)
          if (event.type === 'result' || event.type === 'message') {
            const detail = event.type === 'result'
              ? `status=${String(event.status ?? '?')}, ${String(event.result ?? '').length} chars`
              : `${String(event.text ?? '').length} chars`;
            log(`IPC recv: ${event.type} (${detail})`);
            this.clearTypingTimeout();
          }
          const text = formatOutboundEvent(event);
          if (text) await this.channel.send(text);
        });
      } catch (err) {
        log(`IPC poll error: ${err instanceof Error ? err.message : String(err)}`);
      }
      await new Promise((r) => setTimeout(r, IPC_POLL_MS));
    }
  }

  async stop(): Promise<void> {
    log('Shutting down…');
    this.polling = false;
    this.clearTypingTimeout();
    if (this.taskTimer) {
      clearInterval(this.taskTimer);
      this.taskTimer = null;
    }
    await this.channel.stop();
    try { stopContainer(); } catch { /* not fatal */ }
    log('Shutdown complete');
    process.exit(0);
  }
}
