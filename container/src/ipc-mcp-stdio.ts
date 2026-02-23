import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { CronExpressionParser } from 'cron-parser';
import { sendEventToHost } from './ipc-utils.js';

const TASKS_FILE = '/workspace/ipc/current_tasks.json';

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
  'schedule_task',
  'Schedule a recurring or one-time task.',
  {
    prompt: z.string(),
    schedule_type: z.enum(['cron', 'interval', 'once']),
    schedule_value: z.string(),
    context_mode: z.enum(['group', 'isolated']).default('group'),
  },
  async (args) => {
    if (args.schedule_type === 'cron') {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [{ type: 'text' as const, text: `Invalid cron: "${args.schedule_value}"` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'interval') {
      const ms = parseInt(args.schedule_value, 10);
      if (Number.isNaN(ms) || ms <= 0) {
        return {
          content: [{ type: 'text' as const, text: `Invalid interval: "${args.schedule_value}"` }],
          isError: true,
        };
      }
    } else {
      const date = new Date(args.schedule_value);
      if (Number.isNaN(date.getTime())) {
        return {
          content: [{ type: 'text' as const, text: `Invalid timestamp: "${args.schedule_value}"` }],
          isError: true,
        };
      }
    }

    sendEventToHost({
      type: 'schedule_task',
      prompt: args.prompt,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      context_mode: args.context_mode,
      timestamp: new Date().toISOString(),
    });

    return { content: [{ type: 'text' as const, text: 'Task scheduled.' }] };
  },
);

server.tool(
  'list_tasks',
  'List all scheduled tasks from current_tasks.json.',
  {},
  async () => {
    if (!fs.existsSync(TASKS_FILE)) {
      return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
    }

    try {
      const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8')) as Array<{ id?: string; prompt?: string }>;
      if (tasks.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
      }
      const summary = tasks
        .map((task) => `- [${task.id ?? 'unknown'}] ${(task.prompt ?? '').slice(0, 60)}`)
        .join('\n');
      return { content: [{ type: 'text' as const, text: `Scheduled tasks:\n${summary}` }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  },
);

server.tool(
  'pause_task',
  'Pause a scheduled task.',
  { task_id: z.string() },
  async (args) => {
    sendEventToHost({
      type: 'pause_task',
      taskId: args.task_id,
      timestamp: new Date().toISOString(),
    });
    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} pause requested.` }] };
  },
);

server.tool(
  'resume_task',
  'Resume a paused task.',
  { task_id: z.string() },
  async (args) => {
    sendEventToHost({
      type: 'resume_task',
      taskId: args.task_id,
      timestamp: new Date().toISOString(),
    });
    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} resume requested.` }] };
  },
);

server.tool(
  'cancel_task',
  'Cancel and delete a scheduled task.',
  { task_id: z.string() },
  async (args) => {
    sendEventToHost({
      type: 'cancel_task',
      taskId: args.task_id,
      timestamp: new Date().toISOString(),
    });
    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} cancellation requested.` }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
