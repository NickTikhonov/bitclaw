import fs from 'node:fs';
import path from 'node:path';
import { BitclawPaths } from './config.js';
import { InboundEnvelope, OutboundEnvelope } from './types.js';

export function createMessageFilename(direction: 'in' | 'out', unixSeconds = Math.floor(Date.now() / 1000)): string {
  const rand7 = Math.random().toString(36).slice(2, 9).padEnd(7, '0').slice(0, 7);
  return `${unixSeconds}_${direction}_${rand7}.json`;
}

export function writeMessageAtomic(targetDir: string, fileName: string, payload: unknown): string {
  fs.mkdirSync(targetDir, { recursive: true });
  const finalPath = path.join(targetDir, fileName);
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tmpPath, finalPath);
  return finalPath;
}

export function listMessagesSorted(targetDir: string): string[] {
  if (!fs.existsSync(targetDir)) return [];
  return fs
    .readdirSync(targetDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => path.join(targetDir, file));
}

export function archiveMessage(paths: BitclawPaths, filePath: string): string {
  fs.mkdirSync(paths.ipcArchiveDir, { recursive: true });
  const baseName = path.basename(filePath);
  const archivedPath = path.join(paths.ipcArchiveDir, baseName);
  fs.renameSync(filePath, archivedPath);
  return archivedPath;
}

export interface PollResult {
  processed: number;
  errors: number;
}

export function sendToAgent(paths: BitclawPaths, payload: InboundEnvelope): string {
  const filename = createMessageFilename('in');
  return writeMessageAtomic(paths.ipcInboundDir, filename, payload);
}

export function receiveFromAgent(
  paths: BitclawPaths,
  onEvent: (event: OutboundEnvelope) => void | Promise<void>,
): Promise<PollResult> {
  const files = listMessagesSorted(paths.ipcOutboundDir);
  let processed = 0;
  let errors = 0;

  const run = async () => {
    for (const filePath of files) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as OutboundEnvelope;
        await onEvent(parsed);
        archiveMessage(paths, filePath);
        processed += 1;
      } catch {
        archiveMessage(paths, filePath);
        errors += 1;
      }
    }
    return { processed, errors };
  };

  return run();
}

