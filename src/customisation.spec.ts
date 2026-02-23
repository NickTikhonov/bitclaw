import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, resolveHostPath, resolveMcpServers, buildMountFlags } from './customisation.js';

test('loadConfig returns defaults when file missing', () => {
  const config = loadConfig('/nonexistent/path');
  assert.deepEqual(config.mcpServers, {});
  assert.deepEqual(config.mounts, []);
});

test('loadConfig reads valid config', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  fs.writeFileSync(path.join(tmp, 'bitclaw.config.json'), JSON.stringify({
    mcpServers: { gmail: { command: 'npx', args: ['-y', 'gmail-mcp'], env: ['GMAIL_KEY'] } },
    mounts: [{ host: '~/docs', container: '/workspace/extra/docs', readonly: true }],
  }));
  const config = loadConfig(tmp);
  assert.equal(Object.keys(config.mcpServers).length, 1);
  assert.equal(config.mcpServers.gmail.command, 'npx');
  assert.equal(config.mounts.length, 1);
  fs.rmSync(tmp, { recursive: true });
});

test('resolveHostPath expands tilde', () => {
  const resolved = resolveHostPath('~/test');
  assert.equal(resolved, path.join(os.homedir(), 'test'));
});

test('resolveHostPath resolves absolute paths', () => {
  assert.equal(resolveHostPath('/absolute/path'), '/absolute/path');
});

test('resolveMcpServers pulls env values by name', () => {
  process.env.__TEST_MCP_KEY = 'secret123';
  const result = resolveMcpServers({
    test: { command: 'npx', args: ['-y', 'test-mcp'], env: ['__TEST_MCP_KEY', 'MISSING_VAR'] },
  });
  assert.equal(result.test.env.__TEST_MCP_KEY, 'secret123');
  assert.equal(result.test.env.MISSING_VAR, undefined);
  assert.equal(result.test.command, 'npx');
  delete process.env.__TEST_MCP_KEY;
});

test('buildMountFlags produces correct docker flags', () => {
  const flags = buildMountFlags([
    { host: '/host/path', container: '/container/path', readonly: true },
    { host: '/rw/path', container: '/container/rw', readonly: false },
  ]);
  assert.deepEqual(flags, [
    '-v', '/host/path:/container/path:ro',
    '-v', '/rw/path:/container/rw',
  ]);
});
