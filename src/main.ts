import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from './env.js';
import { Orchestrator } from './orchestrator.js';
import { TelegramChannel } from './telegram.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadProjectEnv(projectRoot);

const required: Record<string, string | undefined> = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
};

const missing = Object.entries(required)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  console.error('Set them in .env or export them before running. See .env.example.');
  process.exit(1);
}

const channel = new TelegramChannel();
const orch = new Orchestrator({ channel, projectRoot });
await orch.start();
