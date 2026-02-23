import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStatus } from './status.js';

test('generateStatus returns static status for built-in tools', () => {
  assert.equal(generateStatus('Bash'), '🖥️ Running a command…');
  assert.equal(generateStatus('Read'), '📖 Reading a file…');
  assert.equal(generateStatus('WebSearch'), '🌐 Searching the web…');
});

test('generateStatus returns a string for unknown tools', () => {
  const status = generateStatus('mcp__gmail__search_emails');
  assert.equal(typeof status, 'string');
  assert.ok(status.length > 0);
});

test('generateStatus returns consistent results for known tools', () => {
  assert.equal(generateStatus('Edit'), generateStatus('Edit'));
});
