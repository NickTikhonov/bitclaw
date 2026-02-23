import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatOutboundEvent,
  isExitCommand,
  isHelpCommand,
  isRestartCommand,
  shouldStopWaitingForTurn,
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
    toolInput: { text: 'hello' },
    timestamp: new Date().toISOString(),
  });
  assert.match(line, /\[tool:call\] \[mcp:nanoclaw\/send_message\]/);
  assert.match(line, /id=toolu_123/);
  assert.match(line, /input=\{"text":"hello"\}/);
});

test('shouldStopWaitingForTurn respects max wait and settle window', () => {
  assert.equal(
    shouldStopWaitingForTurn({
      startMs: 0,
      nowMs: 5000,
      firstResponseMs: null,
      lastResponseMs: null,
      maxWaitMs: 3000,
      settleAfterMs: 1000,
    }),
    true,
  );

  assert.equal(
    shouldStopWaitingForTurn({
      startMs: 0,
      nowMs: 1500,
      firstResponseMs: 1000,
      lastResponseMs: 1100,
      maxWaitMs: 5000,
      settleAfterMs: 300,
    }),
    true,
  );

  assert.equal(
    shouldStopWaitingForTurn({
      startMs: 0,
      nowMs: 1200,
      firstResponseMs: 1000,
      lastResponseMs: 1100,
      maxWaitMs: 5000,
      settleAfterMs: 300,
    }),
    false,
  );
});

