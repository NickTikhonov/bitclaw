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

    // If there's an active status message, replace it with the final text
    if (this.statusMessageId) {
      const msgId = this.statusMessageId;
      this.statusMessageId = null;

      const formatted = telegramifyMarkdown(text, 'escape');
      const first = chunkString(formatted, MAX_MSG_LENGTH)[0];
      try {
        await this.bot.api.editMessageText(this.chatId, msgId, first, {
          parse_mode: 'MarkdownV2',
        });
      } catch {
        try {
          await this.bot.api.editMessageText(
            this.chatId,
            msgId,
            chunkString(text, MAX_MSG_LENGTH)[0],
          );
        } catch {
          // Edit failed entirely — send a new message instead
          await this.sendNew(text);
          return;
        }
      }

      // If the text was longer than one chunk, send remaining chunks as new messages
      const formatted2 = telegramifyMarkdown(text, 'escape');
      const chunks = chunkString(formatted2, MAX_MSG_LENGTH);
      for (let i = 1; i < chunks.length; i++) {
        await this.sendChunk(chunks[i], text);
      }
      return;
    }

    // No status message — sendNew uses sendMessage which clears typing naturally
    await this.sendNew(text);
  }

  setTyping(active: boolean): void {
    if (active) {
      // Don't show typing indicator when a status message is already visible
      if (this.typingInterval || this.statusMessageId) return;
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
      this.bot.api
        .editMessageText(this.chatId, this.statusMessageId, text)
        .catch(() => {});
    } else {
      // Stop typing interval — the status message replaces the typing indicator.
      // sendMessage below clears Telegram's typing indicator naturally.
      this.setTyping(false);

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
      await this.bot.api.sendMessage(
        this.chatId,
        chunkString(plainFallback, MAX_MSG_LENGTH)[0],
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
