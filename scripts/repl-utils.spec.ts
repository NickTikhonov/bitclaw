import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOutboundEvent,
  isExitCommand,
  isHelpCommand,
  isRestartCommand,
} from './repl-utils.js';

test('command helpers detect slash commands', () => {
  assert.equal(isExitCommand('/exit'), true);
  assert.equal(isExitCommand('/quit'), true);
  assert.equal(isHelpCommand('/help'), true);
  assert.equal(isRestartCommand('/restart'), true);
  assert.equal(isExitCommand('hello'), false);
});

test('formatOutboundEvent formats result and error events', () => {
  assert.equal(
    formatOutboundEvent({
      type: 'result',
      status: 'success',
      result: 'hi',
      timestamp: new Date().toISOString(),
    }),
    '[agent] hi',
  );

  assert.equal(
    formatOutboundEvent({
      type: 'result',
      status: 'error',
      error: 'boom',
      timestamp: new Date().toISOString(),
    }),
    '[agent:error] boom',
  );
});

test('formatOutboundEvent formats tool_call and mcp metadata', () => {
  const line = formatOutboundEvent({
    type: 'tool_call',
    toolName: 'mcp__nanoclaw__send_message',
    isMcp: true,
    mcpServer: 'nanoclaw',
    mcpTool: 'send_message',
    toolUseId: 'toolu_123',
    timestamp: new Date().toISOString(),
  });
  assert.match(line, /\[tool:call\] \[mcp:nanoclaw\/send_message\]/);
  assert.match(line, /id=toolu_123/);
  assert.doesNotMatch(line, /input=/);
});
