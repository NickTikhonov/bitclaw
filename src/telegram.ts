import { Bot } from 'grammy';
import telegramifyMarkdown from 'telegramify-markdown';
import type { Channel } from './types.js';

const MAX_MSG_LENGTH = 4096;
const TYPING_REPEAT_MS = 4000;

export class TelegramChannel implements Channel {
  private bot: Bot;
  private chatId: string;
  private handler: ((text: string) => void) | null = null;
  private typingInterval: ReturnType<typeof setInterval> | null = null;
  private statusMessageId: number | null = null;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
    if (!chatId) throw new Error('TELEGRAM_CHAT_ID is required');

    this.chatId = chatId;
    this.bot = new Bot(token);

    this.bot.on('message:text', (ctx) => {
      if (String(ctx.chat.id) !== this.chatId) return;
      this.handler?.(ctx.message.text);
    });
  }

  onMessage(handler: (text: string) => void): void {
    this.handler = handler;
  }

  async send(text: string): Promise<void> {
    this.setTyping(false);

    // Delete the status message if one exists — we must send a NEW message
    // (not edit) because only sendMessage clears Telegram's typing indicator.
    if (this.statusMessageId) {
      const msgId = this.statusMessageId;
      this.statusMessageId = null;
      this.bot.api.deleteMessage(this.chatId, msgId).catch(() => {});
    }

    await this.sendNew(text);
  }

  setTyping(active: boolean): void {
    if (active) {
      // Already typing — idempotent
      if (this.typingInterval) return;
      // Send immediately, then repeat every 4s
      this.bot.api.sendChatAction(this.chatId, 'typing').catch(() => {});
      this.typingInterval = setInterval(() => {
        this.bot.api.sendChatAction(this.chatId, 'typing').catch(() => {});
      }, TYPING_REPEAT_MS);
    } else {
      if (this.typingInterval) {
        clearInterval(this.typingInterval);
        this.typingInterval = null;
      }
    }
  }

  setToolStatus(text: string): void {
    if (this.statusMessageId) {
      // Edit existing status message in place
      this.bot.api
        .editMessageText(this.chatId, this.statusMessageId, text)
        .catch(() => {});
    } else {
      // Send a new status message and store its ID
      this.bot.api
        .sendMessage(this.chatId, text)
        .then((msg) => {
          this.statusMessageId = msg.message_id;
        })
        .catch(() => {});
    }
  }

  async start(): Promise<void> {
    this.bot.start();
  }

  async stop(): Promise<void> {
    this.setTyping(false);
    await this.bot.stop();
  }

  private async sendNew(text: string): Promise<void> {
    const formatted = telegramifyMarkdown(text, 'escape');
    const chunks = chunkString(formatted, MAX_MSG_LENGTH);
    for (const chunk of chunks) {
      await this.sendChunk(chunk, text);
    }
  }

  private async sendChunk(formattedChunk: string, plainFallback: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(this.chatId, formattedChunk, {
        parse_mode: 'MarkdownV2',
      });
    } catch {
      // Fall back to plain text if MarkdownV2 parsing fails
      await this.bot.api.sendMessage(
        this.chatId,
        plainFallback.slice(0, MAX_MSG_LENGTH),
      );
    }
  }
}

function chunkString(str: string, maxLen: number): string[] {
  if (str.length <= maxLen) return [str];
  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += maxLen) {
    chunks.push(str.slice(i, i + maxLen));
  }
  return chunks;
}
