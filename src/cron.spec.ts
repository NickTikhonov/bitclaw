import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isTaskOneShot, isTaskDue, lastScheduledTime, readTask, checkAndFireTasks } from './cron.js';
import { createBitclawPaths } from './config.js';

test('isTaskOneShot returns true for ISO dates', () => {
  assert.equal(isTaskOneShot('2026-02-24T09:00:00'), true);
  assert.equal(isTaskOneShot('2026-02-24T09:00:00Z'), true);
  assert.equal(isTaskOneShot('2026-12-31'), true);
});

test('isTaskOneShot returns false for cron expressions', () => {
  assert.equal(isTaskOneShot('0 9 * * *'), false);
  assert.equal(isTaskOneShot('*/5 * * * *'), false);
  assert.equal(isTaskOneShot('30 14 1 * *'), false);
});

test('lastScheduledTime returns prev occurrence', () => {
  const now = new Date(2026, 1, 23, 10, 30, 15); // 10:30:15
  const prev = lastScheduledTime('30 10 * * *', now);
  assert.ok(prev);
  assert.equal(prev.getHours(), 10);
  assert.equal(prev.getMinutes(), 30);
});

test('lastScheduledTime returns null for invalid expression', () => {
  assert.equal(lastScheduledTime('not-valid', new Date()), null);
});

test('isTaskDue fires cron when never run', () => {
  const now = new Date(2026, 1, 23, 10, 30, 15);
  const task = { schedule: '30 10 * * *', prompt: 'test' };
  assert.equal(isTaskDue(task, now), true);
});

test('isTaskDue skips cron when already run this occurrence', () => {
  const now = new Date(2026, 1, 23, 10, 30, 15);
  // lastRunAt is after the 10:30 occurrence
  const task = { schedule: '30 10 * * *', prompt: 'test', lastRunAt: '2026-02-23T10:30:05.000Z' };
  assert.equal(isTaskDue(task, now), false);
});

test('isTaskDue fires cron when missed (laptop sleep)', () => {
  // Schedule is 9:00 daily, laptop woke at 9:05, lastRun was yesterday
  const now = new Date(2026, 1, 23, 9, 5, 0);
  const task = { schedule: '0 9 * * *', prompt: 'test', lastRunAt: '2026-02-22T09:00:30.000Z' };
  assert.equal(isTaskDue(task, now), true);
});

test('isTaskDue fires one-shot when past and never run', () => {
  const now = new Date('2026-02-23T12:00:00Z');
  const task = { schedule: '2026-02-23T09:00:00Z', prompt: 'test' };
  assert.equal(isTaskDue(task, now), true);
});

test('isTaskDue skips one-shot when already run', () => {
  const now = new Date('2026-02-23T12:00:00Z');
  const task = { schedule: '2026-02-23T09:00:00Z', prompt: 'test', lastRunAt: '2026-02-23T09:00:05.000Z' };
  assert.equal(isTaskDue(task, now), false);
});

test('isTaskDue skips future one-shot', () => {
  const now = new Date('2026-02-23T08:00:00Z');
  const task = { schedule: '2026-02-23T09:00:00Z', prompt: 'test' };
  assert.equal(isTaskDue(task, now), false);
});

test('isTaskDue returns false for invalid schedule', () => {
  const task = { schedule: 'not-a-schedule', prompt: 'test' };
  assert.equal(isTaskDue(task, new Date()), false);
});

test('readTask parses valid JSON', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-'));
  const file = path.join(tmp, 'test.json');
  fs.writeFileSync(file, JSON.stringify({ schedule: '0 9 * * *', prompt: 'hello' }));
  const task = readTask(file);
  assert.deepEqual(task, { schedule: '0 9 * * *', prompt: 'hello', lastRunAt: undefined });
  fs.rmSync(tmp, { recursive: true });
});

test('readTask parses lastRunAt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-'));
  const file = path.join(tmp, 'test.json');
  fs.writeFileSync(file, JSON.stringify({ schedule: '0 9 * * *', prompt: 'hello', lastRunAt: '2026-02-23T09:00:00Z' }));
  const task = readTask(file);
  assert.equal(task?.lastRunAt, '2026-02-23T09:00:00Z');
  fs.rmSync(tmp, { recursive: true });
});

test('readTask returns null for invalid JSON', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-'));
  const file = path.join(tmp, 'bad.json');
  fs.writeFileSync(file, 'not json');
  assert.equal(readTask(file), null);
  fs.rmSync(tmp, { recursive: true });
});

test('checkAndFireTasks fires due task and writes lastRunAt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-fire-'));
  const tasksDir = path.join(tmp, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  const paths = createBitclawPaths(tmp);
  fs.mkdirSync(paths.ipcInboundDir, { recursive: true });

  // Cron that's always due (every minute) with no lastRunAt
  fs.writeFileSync(
    path.join(tasksDir, 'every-min.json'),
    JSON.stringify({ schedule: '* * * * *', prompt: 'do stuff' }),
  );

  checkAndFireTasks(tasksDir, paths);

  // Should have created an inbound IPC file
  const inbound = fs.readdirSync(paths.ipcInboundDir).filter((f) => f.endsWith('.json'));
  assert.equal(inbound.length, 1);

  // Task file should now have lastRunAt
  const updated = readTask(path.join(tasksDir, 'every-min.json'));
  assert.ok(updated?.lastRunAt);

  // Second call should NOT fire again (lastRunAt is fresh)
  checkAndFireTasks(tasksDir, paths);
  const inbound2 = fs.readdirSync(paths.ipcInboundDir).filter((f) => f.endsWith('.json'));
  assert.equal(inbound2.length, 1); // still 1

  fs.rmSync(tmp, { recursive: true });
});

test('checkAndFireTasks deletes one-shot after firing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-fire-'));
  const tasksDir = path.join(tmp, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  const paths = createBitclawPaths(tmp);
  fs.mkdirSync(paths.ipcInboundDir, { recursive: true });

  fs.writeFileSync(
    path.join(tasksDir, 'oneshot.json'),
    JSON.stringify({ schedule: '2020-01-01T00:00:00Z', prompt: 'old task' }),
  );

  checkAndFireTasks(tasksDir, paths);

  // One-shot file should be deleted
  assert.equal(fs.existsSync(path.join(tasksDir, 'oneshot.json')), false);

  // Should have created an inbound IPC file
  const inbound = fs.readdirSync(paths.ipcInboundDir).filter((f) => f.endsWith('.json'));
  assert.equal(inbound.length, 1);

  fs.rmSync(tmp, { recursive: true });
});
