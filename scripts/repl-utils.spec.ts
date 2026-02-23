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
    'hi',
  );

  assert.equal(
    formatOutboundEvent({
      type: 'result',
      status: 'error',
      error: 'boom',
      timestamp: new Date().toISOString(),
    }),
    '[error] boom',
  );
});

test('formatOutboundEvent returns message text directly', () => {
  assert.equal(
    formatOutboundEvent({
      type: 'message',
      text: 'Working on it...',
      timestamp: new Date().toISOString(),
    }),
    'Working on it...',
  );
});

test('formatOutboundEvent returns null for tool_call events', () => {
  assert.equal(
    formatOutboundEvent({
      type: 'tool_call',
      toolName: 'mcp__nanoclaw__send_message',
      isMcp: true,
      mcpServer: 'nanoclaw',
      mcpTool: 'send_message',
      toolUseId: 'toolu_123',
      timestamp: new Date().toISOString(),
    }),
    null,
  );
});
