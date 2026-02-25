export type InboundType = 'messages' | 'task' | 'shutdown';

export type OutboundType =
  | 'result'
  | 'message'
  | 'tool_calls'
  | 'typing';

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

export interface InboundShutdown extends InboundEnvelopeBase {
  type: 'shutdown';
}

export type InboundEnvelope =
  | InboundMessages
  | InboundTask
  | InboundShutdown;

export interface OutboundEnvelope {
  type: OutboundType;
  timestamp: string;
  [key: string]: unknown;
}

export interface Channel {
  send(text: string): Promise<void>;
  onMessage(handler: (text: string) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  setTyping(active: boolean): void;
  setToolStatus(text: string): void;
}
