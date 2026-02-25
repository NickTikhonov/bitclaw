import fs from 'node:fs';
import path from 'node:path';
import { CronExpressionParser } from 'cron-parser';
import type { BitclawPaths } from './config.js';
import { sendToAgent } from './ipc.js';

export interface TaskDefinition {
  schedule: string;
  prompt: string;
  lastRunAt?: string; // ISO timestamp of most recent execution
}

export function ensureTasksDir(tasksDir: string): void {
  fs.mkdirSync(tasksDir, { recursive: true });
}

export function isTaskOneShot(schedule: string): boolean {
  // Cron expressions contain spaces between fields; ISO dates don't
  if (/^\d{1,2}\s/.test(schedule) || schedule.startsWith('*')) return false;
  const d = new Date(schedule);
  return !Number.isNaN(d.getTime());
}

/**
 * For a cron schedule, return the most recent time it was due (truncated to the minute).
 * Returns null if the expression is invalid.
 */
export function lastScheduledTime(schedule: string, now: Date): Date | null {
  try {
    const expr = CronExpressionParser.parse(schedule, { currentDate: now });
    return expr.prev().toDate();
  } catch {
    return null;
  }
}

/**
 * Determine whether a task should fire. A task is due when:
 *
 * - **Cron**: the most recent scheduled time (`prev()`) is after the task's `lastRunAt`.
 *   This catches exact matches AND missed runs (e.g. laptop was asleep).
 *
 * - **One-shot**: `now >= schedule` and the task has never run (`lastRunAt` is absent).
 */
export function isTaskDue(task: TaskDefinition, now: Date): boolean {
  const lastRun = task.lastRunAt ? new Date(task.lastRunAt) : null;

  if (isTaskOneShot(task.schedule)) {
    // One-shots fire once: when their time has passed and they haven't run yet
    return !lastRun && now >= new Date(task.schedule);
  }

  const prev = lastScheduledTime(task.schedule, now);
  if (!prev) return false;

  // Fire if prev is after lastRun (or if never run)
  return !lastRun || prev.getTime() > lastRun.getTime();
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
    return {
      schedule: raw.schedule,
      prompt: raw.prompt,
      lastRunAt: typeof raw.lastRunAt === 'string' ? raw.lastRunAt : undefined,
    };
  } catch {
    return null;
  }
}

function updateTaskLastRun(filePath: string, task: TaskDefinition, now: Date): void {
  try {
    const updated = { ...task, lastRunAt: now.toISOString() };
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
  } catch { /* best-effort */ }
}

export function checkAndFireTasks(
  tasksDir: string,
  paths: BitclawPaths,
): void {
  const now = new Date();

  for (const filePath of listTaskFiles(tasksDir)) {
    const task = readTask(filePath);
    if (!task) continue;
    if (!isTaskDue(task, now)) continue;

    sendToAgent(paths, {
      type: 'task',
      taskId: path.basename(filePath, '.json'),
      prompt: task.prompt,
      timestamp: now.toISOString(),
    });

    if (isTaskOneShot(task.schedule)) {
      try { fs.unlinkSync(filePath); } catch { /* already gone */ }
    } else {
      updateTaskLastRun(filePath, task, now);
    }
  }
}
