import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStatus } from './status.js';

test('generateStatus returns static status for built-in tools', async () => {
  const bash = await generateStatus('Bash');
  assert.equal(bash, '🖥️ Running a command…');

  const read = await generateStatus('Read');
  assert.equal(read, '📖 Reading a file…');

  const web = await generateStatus('WebSearch');
  assert.equal(web, '🌐 Searching the web…');
});

test('generateStatus returns fallback when no API key', async () => {
  // Without ANTHROPIC_API_KEY set, unknown tools should get the fallback
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const status = await generateStatus('mcp__gmail__search_emails');
  assert.equal(status, '⚙️ Working on it…');

  // Restore
  if (original) process.env.ANTHROPIC_API_KEY = original;
});

test('generateStatus returns consistent results for same tool', async () => {
  const a = await generateStatus('Edit');
  const b = await generateStatus('Edit');
  assert.equal(a, b);
});
