import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBitclawPaths } from './config.js';
import { buildIpcFilename, pollOutbound, sendInbound, writeJsonAtomic } from './ipc.js';

function mkTempPaths() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitclaw-test-'));
  return createBitclawPaths(tempDir);
}

test('buildIpcFilename uses unix_direction_rand7 format', () => {
  const file = buildIpcFilename('in', 1739859452);
  assert.match(file, /^1739859452_in_[a-z0-9]{7}\.json$/);
});

test('sendInbound writes one inbound file with payload', () => {
  const paths = mkTempPaths();
  const payload = {
    type: 'messages' as const,
    text: 'hello',
    timestamp: new Date().toISOString(),
  };
  const writtenPath = sendInbound(paths, payload);

  assert.ok(fs.existsSync(writtenPath));
  const parsed = JSON.parse(fs.readFileSync(writtenPath, 'utf8')) as { type: string; text: string };
  assert.equal(parsed.type, 'messages');
  assert.equal(parsed.text, 'hello');
  assert.equal(fs.readdirSync(paths.ipcInboundDir).length, 1);
});

test('pollOutbound archives successful events', async () => {
  const paths = mkTempPaths();
  fs.mkdirSync(paths.ipcOutboundDir, { recursive: true });
  fs.mkdirSync(paths.ipcArchiveDir, { recursive: true });

  writeJsonAtomic(paths.ipcOutboundDir, '1739859455_out_abc1234.json', {
    type: 'result',
    status: 'success',
    result: 'ok',
    timestamp: new Date().toISOString(),
  });

  let called = 0;
  const result = await pollOutbound(paths, async () => {
    called += 1;
  });

  assert.equal(called, 1);
  assert.equal(result.processed, 1);
  assert.equal(result.errors, 0);
  assert.equal(fs.readdirSync(paths.ipcOutboundDir).length, 0);
  assert.equal(fs.readdirSync(paths.ipcArchiveDir).length, 1);
});

test('pollOutbound archives parse errors with error_ prefix', async () => {
  const paths = mkTempPaths();
  fs.mkdirSync(paths.ipcOutboundDir, { recursive: true });
  fs.mkdirSync(paths.ipcArchiveDir, { recursive: true });
  fs.writeFileSync(path.join(paths.ipcOutboundDir, '1739859455_out_bad0001.json'), '{not-json');

  const result = await pollOutbound(paths, async () => undefined);

  assert.equal(result.processed, 0);
  assert.equal(result.errors, 1);
  const archived = fs.readdirSync(paths.ipcArchiveDir);
  assert.equal(archived.length, 1);
  assert.match(archived[0], /^error_1739859455_out_bad0001\.json$/);
});
