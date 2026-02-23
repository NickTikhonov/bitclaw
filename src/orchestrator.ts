import { IPC_POLL_MS, type BitclawPaths } from './config.js';
import { formatOutboundEvent } from './format.js';
import { receiveFromAgent, sendToAgent } from './ipc.js';
import { ensureContainer, restartContainer, stopContainer } from './runtime.js';
import type { Channel } from './types.js';

const RESTART_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

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

    // Start background IPC poller
    this.polling = true;
    this.pollLoop();

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

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      try {
        await receiveFromAgent(this.paths!, async (event) => {
          const text = formatOutboundEvent(event);
          await this.channel.send(text);
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
    if (this.restartTimer) {
      clearInterval(this.restartTimer);
      this.restartTimer = null;
    }
    await this.channel.stop();
    try { stopContainer(); } catch { /* not fatal */ }
    process.exit(0);
  }
}
