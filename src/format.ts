import { OutboundEnvelope } from './types.js';

/**
 * Format an outbound event for display. Returns null for events that
 * should not be forwarded to channels (e.g. internal tool_call telemetry).
 */
export function formatOutboundEvent(event: OutboundEnvelope): string | null {
  if (event.type === 'result') {
    const status = String(event.status ?? 'unknown');
    if (status === 'error') {
      return `[error] ${String(event.error ?? 'Unknown error')}`;
    }
    return String(event.result ?? '').trimEnd();
  }

  if (event.type === 'message') {
    return String(event.text ?? '');
  }

  // tool_call events are internal telemetry — don't forward to channels
  if (event.type === 'tool_call') {
    return null;
  }

  return null;
}
