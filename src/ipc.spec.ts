import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBitclawPaths } from './config.js';
import { createMessageFilename, receiveFromAgent, sendToAgent, writeMessageAtomic } from './ipc.js';

function mkTempPaths() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitclaw-test-'));
  return createBitclawPaths(tempDir);
}

test('createMessageFilename uses unix_direction_rand7 format', () => {
  const file = createMessageFilename('in', 1739859452);
  assert.match(file, /^1739859452_in_[a-z0-9]{7}\.json$/);
});

test('sendToAgent writes one inbound file with payload', () => {
  const paths = mkTempPaths();
  const payload = {
    type: 'messages' as const,
    text: 'hello',
    timestamp: new Date().toISOString(),
  };
  const writtenPath = sendToAgent(paths, payload);

  assert.ok(fs.existsSync(writtenPath));
  const parsed = JSON.parse(fs.readFileSync(writtenPath, 'utf8')) as { type: string; text: string };
  assert.equal(parsed.type, 'messages');
  assert.equal(parsed.text, 'hello');
  assert.equal(fs.readdirSync(paths.ipcInboundDir).length, 1);
});

test('receiveFromAgent archives successful events', async () => {
  const paths = mkTempPaths();
  fs.mkdirSync(paths.ipcOutboundDir, { recursive: true });
  fs.mkdirSync(paths.ipcArchiveDir, { recursive: true });

  writeMessageAtomic(paths.ipcOutboundDir, '1739859455_out_abc1234.json', {
    type: 'result',
    status: 'success',
    result: 'ok',
    timestamp: new Date().toISOString(),
  });

  let called = 0;
  const result = await receiveFromAgent(paths, async () => {
    called += 1;
  });

  assert.equal(called, 1);
  assert.equal(result.processed, 1);
  assert.equal(result.errors, 0);
  assert.equal(fs.readdirSync(paths.ipcOutboundDir).length, 0);
  assert.equal(fs.readdirSync(paths.ipcArchiveDir).length, 1);
});

test('receiveFromAgent archives parse errors with original filename', async () => {
  const paths = mkTempPaths();
  fs.mkdirSync(paths.ipcOutboundDir, { recursive: true });
  fs.mkdirSync(paths.ipcArchiveDir, { recursive: true });
  fs.writeFileSync(path.join(paths.ipcOutboundDir, '1739859455_out_bad0001.json'), '{not-json');

  const result = await receiveFromAgent(paths, async () => undefined);

  assert.equal(result.processed, 0);
  assert.equal(result.errors, 1);
  const archived = fs.readdirSync(paths.ipcArchiveDir);
  assert.equal(archived.length, 1);
  assert.equal(archived[0], '1739859455_out_bad0001.json');
});
