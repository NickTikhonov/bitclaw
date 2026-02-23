import { createBitclawPaths } from '../src/config.js';
import { sendToAgent } from '../src/ipc.js';
import { InboundEnvelope } from '../src/types.js';

const [, , typeArg = 'messages', ...rest] = process.argv;

const now = new Date().toISOString();
const paths = createBitclawPaths();
const text = rest.join(' ').trim();

let payload: InboundEnvelope;
if (typeArg === 'messages') {
  payload = { type: 'messages', text: text || 'hello from bitclaw', timestamp: now };
} else if (typeArg === 'task') {
  payload = {
    type: 'task',
    taskId: `task-${Date.now()}`,
    prompt: text || 'run task',
    timestamp: now,
  };
} else if (typeArg === 'heartbeat') {
  payload = { type: 'heartbeat', prompt: text || 'heartbeat', timestamp: now };
} else if (typeArg === 'shutdown') {
  payload = { type: 'shutdown', timestamp: now };
} else {
  console.error('Usage: npm run ipc:send -- <messages|task|heartbeat|shutdown> [text]');
  process.exit(1);
}

const filePath = sendToAgent(paths, payload);
console.log(filePath);

