import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { CronExpressionParser } from 'cron-parser';
import { sendEventToHost } from './ipc-utils.js';

const TASKS_DIR = '/workspace/workspace/tasks';

function ensureTasksDir(): void {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
}

function taskPath(name: string): string {
  return path.join(TASKS_DIR, `${name}.json`);
}

function isValidSchedule(schedule: string): string | null {
  // Try cron first
  try {
    CronExpressionParser.parse(schedule);
    return null;
  } catch { /* not cron */ }
  // Try ISO date
  const d = new Date(schedule);
  if (!Number.isNaN(d.getTime())) return null;
  return `Invalid schedule: "${schedule}". Use a 5-field cron expression or an ISO date string.`;
}

const server = new McpServer({
  name: 'nanoclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  'Send a message to the user immediately.',
  {
    text: z.string().describe('The message text to send'),
    sender: z.string().optional().describe('Optional sender label'),
  },
  async (args) => {
    sendEventToHost({
      type: 'message',
      text: args.text,
      sender: args.sender,
      timestamp: new Date().toISOString(),
    });
    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);

server.tool(
  'create_task',
  'Create a recurring or one-shot task. Recurring tasks use a 5-field cron expression (e.g. "0 9 * * *"). One-shot tasks use an ISO date string (e.g. "2026-03-01T14:00:00Z").',
  {
    name: z.string().describe('Short kebab-case name for the task file (e.g. "daily-email-check")'),
    schedule: z.string().describe('Cron expression for recurring, or ISO date for one-shot'),
    prompt: z.string().describe('The prompt text to send to the agent when the task fires'),
  },
  async (args) => {
    const err = isValidSchedule(args.schedule);
    if (err) return { content: [{ type: 'text' as const, text: err }], isError: true };

    ensureTasksDir();
    const filePath = taskPath(args.name);
    if (fs.existsSync(filePath)) {
      return { content: [{ type: 'text' as const, text: `Task "${args.name}" already exists. Use edit_task to modify it.` }], isError: true };
    }
    fs.writeFileSync(filePath, JSON.stringify({ schedule: args.schedule, prompt: args.prompt }, null, 2));
    return { content: [{ type: 'text' as const, text: `Task "${args.name}" created.` }] };
  },
);

server.tool(
  'list_tasks',
  'List all scheduled tasks.',
  {},
  async () => {
    ensureTasksDir();
    const files = fs.readdirSync(TASKS_DIR).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No tasks found.' }] };
    }
    const lines = files.map((f) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, f), 'utf8')) as Record<string, unknown>;
        const name = f.replace(/\.json$/, '');
        return `- ${name}: schedule="${String(raw.schedule ?? '?')}" prompt="${String(raw.prompt ?? '').slice(0, 60)}"`;
      } catch {
        return `- ${f}: (unreadable)`;
      }
    });
    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

server.tool(
  'read_task',
  'Read the full definition of a specific task.',
  {
    name: z.string().describe('Task name (without .json extension)'),
  },
  async (args) => {
    ensureTasksDir();
    const filePath = taskPath(args.name);
    if (!fs.existsSync(filePath)) {
      return { content: [{ type: 'text' as const, text: `Task "${args.name}" not found.` }], isError: true };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return { content: [{ type: 'text' as const, text: content }] };
  },
);

server.tool(
  'edit_task',
  'Edit an existing task. You can update the schedule, the prompt, or both.',
  {
    name: z.string().describe('Task name (without .json extension)'),
    schedule: z.string().optional().describe('New cron expression or ISO date'),
    prompt: z.string().optional().describe('New prompt text'),
  },
  async (args) => {
    ensureTasksDir();
    const filePath = taskPath(args.name);
    if (!fs.existsSync(filePath)) {
      return { content: [{ type: 'text' as const, text: `Task "${args.name}" not found.` }], isError: true };
    }

    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    if (args.schedule !== undefined) {
      const err = isValidSchedule(args.schedule);
      if (err) return { content: [{ type: 'text' as const, text: err }], isError: true };
      existing.schedule = args.schedule;
    }
    if (args.prompt !== undefined) {
      existing.prompt = args.prompt;
    }

    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
    return { content: [{ type: 'text' as const, text: `Task "${args.name}" updated.` }] };
  },
);

server.tool(
  'delete_task',
  'Delete a task.',
  {
    name: z.string().describe('Task name (without .json extension)'),
  },
  async (args) => {
    ensureTasksDir();
    const filePath = taskPath(args.name);
    if (!fs.existsSync(filePath)) {
      return { content: [{ type: 'text' as const, text: `Task "${args.name}" not found.` }], isError: true };
    }
    fs.unlinkSync(filePath);
    return { content: [{ type: 'text' as const, text: `Task "${args.name}" deleted.` }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
