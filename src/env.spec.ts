import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProjectEnv } from './env.js';

test('loadProjectEnv parses plain KEY=VALUE', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitclaw-env-'));
  fs.writeFileSync(path.join(dir, '.env'), 'ANTHROPIC_API_KEY=abc123\n');
  delete process.env.ANTHROPIC_API_KEY;

  loadProjectEnv(dir);

  assert.equal(process.env.ANTHROPIC_API_KEY, 'abc123');
});

test('loadProjectEnv parses export KEY="VALUE"', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitclaw-env-'));
  fs.writeFileSync(path.join(dir, '.env'), 'export CLAUDE_CODE_OAUTH_TOKEN="tok_xyz"\n');
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;

  loadProjectEnv(dir);

  assert.equal(process.env.CLAUDE_CODE_OAUTH_TOKEN, 'tok_xyz');
});

test('loadProjectEnv does not override existing env vars', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitclaw-env-'));
  fs.writeFileSync(path.join(dir, '.env'), 'ANTHROPIC_API_KEY=from_file\n');
  process.env.ANTHROPIC_API_KEY = 'from_shell';

  loadProjectEnv(dir);

  assert.equal(process.env.ANTHROPIC_API_KEY, 'from_shell');
});
