export type InboundType = 'messages' | 'task' | 'heartbeat' | 'shutdown';

export type OutboundType =
  | 'result'
  | 'message'
  | 'tool_call'
  | 'schedule_task'
  | 'pause_task'
  | 'resume_task'
  | 'cancel_task';

export interface InboundEnvelopeBase {
  type: InboundType;
  timestamp: string;
}

export interface InboundMessages extends InboundEnvelopeBase {
  type: 'messages';
  text: string;
}

export interface InboundTask extends InboundEnvelopeBase {
  type: 'task';
  taskId: string;
  prompt: string;
}

export interface InboundHeartbeat extends InboundEnvelopeBase {
  type: 'heartbeat';
  prompt: string;
}

export interface InboundShutdown extends InboundEnvelopeBase {
  type: 'shutdown';
}

export type InboundEnvelope =
  | InboundMessages
  | InboundTask
  | InboundHeartbeat
  | InboundShutdown;

export interface OutboundEnvelope {
  type: OutboundType;
  timestamp: string;
  [key: string]: unknown;
}

export type Direction = 'in' | 'out';

