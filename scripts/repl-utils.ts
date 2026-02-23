import { OutboundEnvelope } from '../src/types.js';

export function isExitCommand(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === '/exit' || normalized === '/quit';
}

export function isRestartCommand(input: string): boolean {
  return input.trim().toLowerCase() === '/restart';
}

export function isHelpCommand(input: string): boolean {
  return input.trim().toLowerCase() === '/help';
}

export function formatOutboundEvent(event: OutboundEnvelope): string {
  if (event.type === 'result') {
    const status = String(event.status ?? 'unknown');
    if (status === 'error') {
      return `[agent:error] ${String(event.error ?? 'Unknown error')}`;
    }
    return `[agent] ${String(event.result ?? '')}`.trimEnd();
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
