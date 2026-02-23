import { OutboundEnvelope } from './types.js';

export function formatOutboundEvent(event: OutboundEnvelope): string {
  if (event.type === 'result') {
    const status = String(event.status ?? 'unknown');
    if (status === 'error') {
      return `[agent:error] ${String(event.error ?? 'Unknown error')}`;
    }
    return String(event.result ?? '').trimEnd();
  }

  if (event.type === 'message') {
    const sender = event.sender ? `${String(event.sender)}: ` : '';
    return `[tool:message] ${sender}${String(event.text ?? '')}`;
  }

  if (event.type === 'tool_call') {
    const toolName = String(event.toolName ?? 'unknown');
    const toolUseId = event.toolUseId ? ` id=${String(event.toolUseId)}` : '';
    const isMcp = Boolean(event.isMcp);
    const mcpPrefix = isMcp
      ? `[mcp:${String(event.mcpServer ?? 'unknown')}/${String(event.mcpTool ?? toolName)}] `
      : '';
    return `[tool:call] ${mcpPrefix}${toolName}${toolUseId}`;
  }

  return `[tool:${event.type}] ${JSON.stringify(event)}`;
}
