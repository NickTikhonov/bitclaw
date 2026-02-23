import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isOneShot, isDue, truncateToMinute, minuteKey, readTask, checkAndFireTasks } from './cron.js';
import { createBitclawPaths } from './config.js';

test('isOneShot returns true for ISO dates', () => {
  assert.equal(isOneShot('2026-02-24T09:00:00'), true);
  assert.equal(isOneShot('2026-02-24T09:00:00Z'), true);
  assert.equal(isOneShot('2026-12-31'), true);
});

test('isOneShot returns false for cron expressions', () => {
  assert.equal(isOneShot('0 9 * * *'), false);
  assert.equal(isOneShot('*/5 * * * *'), false);
  assert.equal(isOneShot('30 14 1 * *'), false);
});

test('truncateToMinute zeroes out seconds and ms', () => {
  const d = new Date('2026-02-23T10:30:45.123Z');
  const t = truncateToMinute(d);
  assert.equal(t.getSeconds(), 0);
  assert.equal(t.getMilliseconds(), 0);
  assert.equal(t.getMinutes(), d.getMinutes());
});

test('minuteKey returns same string for same minute', () => {
  const a = new Date('2026-02-23T10:30:00Z');
  const b = new Date('2026-02-23T10:30:45Z');
  assert.equal(minuteKey(a), minuteKey(b));
});

test('isDue returns true when cron matches current minute', () => {
  // 30 10 * * * = at 10:30 every day
  const now = new Date(2026, 1, 23, 10, 30, 15); // Feb 23 2026, 10:30:15
  assert.equal(isDue('30 10 * * *', now), true);
});

test('isDue returns false when cron does not match', () => {
  const now = new Date(2026, 1, 23, 10, 31, 0);
  assert.equal(isDue('30 10 * * *', now), false);
});

test('isDue returns true for past one-shot', () => {
  const now = new Date('2026-02-23T12:00:00Z');
  assert.equal(isDue('2026-02-23T09:00:00Z', now), true);
});

test('isDue returns false for future one-shot', () => {
  const now = new Date('2026-02-23T08:00:00Z');
  assert.equal(isDue('2026-02-23T09:00:00Z', now), false);
});

test('isDue returns false for invalid schedule', () => {
  const now = new Date();
  assert.equal(isDue('not-a-schedule', now), false);
});

test('readTask parses valid JSON', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-'));
  const file = path.join(tmp, 'test.json');
  fs.writeFileSync(file, JSON.stringify({ schedule: '0 9 * * *', prompt: 'hello' }));
  const task = readTask(file);
  assert.deepEqual(task, { schedule: '0 9 * * *', prompt: 'hello' });
  fs.rmSync(tmp, { recursive: true });
});

test('readTask returns null for invalid JSON', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-test-'));
  const file = path.join(tmp, 'bad.json');
  fs.writeFileSync(file, 'not json');
  assert.equal(readTask(file), null);
  fs.rmSync(tmp, { recursive: true });
});

test('checkAndFireTasks fires due cron and deletes one-shot', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-fire-'));
  const tasksDir = path.join(tmp, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  const paths = createBitclawPaths(tmp);
  fs.mkdirSync(paths.ipcInboundDir, { recursive: true });

  // One-shot in the past
  fs.writeFileSync(
    path.join(tasksDir, 'oneshot.json'),
    JSON.stringify({ schedule: '2020-01-01T00:00:00Z', prompt: 'old task' }),
  );

  const returned = checkAndFireTasks(tasksDir, paths, '');
  assert.ok(returned.length > 0);
  // One-shot file should be deleted
  assert.equal(fs.existsSync(path.join(tasksDir, 'oneshot.json')), false);
  // Should have created an inbound IPC file
  const inbound = fs.readdirSync(paths.ipcInboundDir).filter((f) => f.endsWith('.json'));
  assert.equal(inbound.length, 1);

  fs.rmSync(tmp, { recursive: true });
});

test('checkAndFireTasks skips when same minute', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cron-skip-'));
  const tasksDir = path.join(tmp, 'tasks');
  fs.mkdirSync(tasksDir, { recursive: true });
  const paths = createBitclawPaths(tmp);
  fs.mkdirSync(paths.ipcInboundDir, { recursive: true });

  fs.writeFileSync(
    path.join(tasksDir, 'past.json'),
    JSON.stringify({ schedule: '2020-01-01T00:00:00Z', prompt: 'test' }),
  );

  const minute = checkAndFireTasks(tasksDir, paths, '');
  // Second call with same minute should be a no-op
  checkAndFireTasks(tasksDir, paths, minute);
  // File was already deleted on first call, so no extra IPC
  const inbound = fs.readdirSync(paths.ipcInboundDir).filter((f) => f.endsWith('.json'));
  assert.equal(inbound.length, 1);

  fs.rmSync(tmp, { recursive: true });
});
