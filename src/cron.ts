import fs from 'node:fs';
import path from 'node:path';
import { CronExpressionParser } from 'cron-parser';
import type { BitclawPaths } from './config.js';
import { sendToAgent } from './ipc.js';

export interface TaskDefinition {
  schedule: string;
  prompt: string;
}

export function ensureTasksDir(tasksDir: string): void {
  fs.mkdirSync(tasksDir, { recursive: true });
}

export function isOneShot(schedule: string): boolean {
  // Cron expressions contain spaces between fields; ISO dates don't start with digits followed by spaces
  if (/^\d{1,2}\s/.test(schedule) || schedule.startsWith('*')) return false;
  const d = new Date(schedule);
  return !Number.isNaN(d.getTime());
}

export function isDue(schedule: string, now: Date): boolean {
  if (isOneShot(schedule)) {
    return now >= new Date(schedule);
  }

  try {
    const expr = CronExpressionParser.parse(schedule, { currentDate: now });
    const prev = expr.prev().toDate();
    // Match if prev falls in the same minute as now
    return truncateToMinute(prev).getTime() === truncateToMinute(now).getTime();
  } catch {
    return false;
  }
}

export function truncateToMinute(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
}

export function minuteKey(d: Date): string {
  return truncateToMinute(d).toISOString();
}

export function listTaskFiles(tasksDir: string): string[] {
  ensureTasksDir(tasksDir);
  return fs
    .readdirSync(tasksDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(tasksDir, f));
}

export function readTask(filePath: string): TaskDefinition | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    if (typeof raw.schedule !== 'string' || typeof raw.prompt !== 'string') return null;
    return { schedule: raw.schedule, prompt: raw.prompt };
  } catch {
    return null;
  }
}

export function checkAndFireTasks(
  tasksDir: string,
  paths: BitclawPaths,
  lastMinute: string,
): string {
  const now = new Date();
  const currentMinute = minuteKey(now);
  if (currentMinute === lastMinute) return lastMinute;

  for (const filePath of listTaskFiles(tasksDir)) {
    const task = readTask(filePath);
    if (!task) continue;

    if (!isDue(task.schedule, now)) continue;

    sendToAgent(paths, {
      type: 'task',
      taskId: path.basename(filePath, '.json'),
      prompt: task.prompt,
      timestamp: now.toISOString(),
    });

    if (isOneShot(task.schedule)) {
      try { fs.unlinkSync(filePath); } catch { /* already gone */ }
    }
  }

  return currentMinute;
}
