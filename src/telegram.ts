import { Bot } from 'grammy';
import telegramifyMarkdown from 'telegramify-markdown';
import type { Channel } from './types.js';

const MAX_MSG_LENGTH = 4096;

export class TelegramChannel implements Channel {
  private bot: Bot;
  private chatId: string;
  private handler: ((text: string) => void) | null = null;

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
    const formatted = telegramifyMarkdown(text, 'escape');
    const chunks = chunkString(formatted, MAX_MSG_LENGTH);
    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(this.chatId, chunk, { parse_mode: 'MarkdownV2' });
      } catch {
        // Fall back to plain text if MarkdownV2 parsing fails
        await this.bot.api.sendMessage(this.chatId, text.slice(0, MAX_MSG_LENGTH));
      }
    }
  }

  async start(): Promise<void> {
    this.bot.start();
  }

  async stop(): Promise<void> {
    await this.bot.stop();
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
