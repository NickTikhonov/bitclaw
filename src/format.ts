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

  // tool_call and typing events are handled by the orchestrator directly
  if (event.type === 'tool_call' || event.type === 'typing') {
    return null;
  }

  return null;
}
