import fs from 'node:fs';
import path from 'node:path';

export const IPC_DIR = '/workspace/ipc';
export const INBOUND_DIR = path.join(IPC_DIR, 'inbound');
export const OUTBOUND_DIR = path.join(IPC_DIR, 'outbound');
export const ARCHIVE_DIR = path.join(IPC_DIR, 'archive');

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

export function sendEventToHost(payload: Record<string, unknown>): string {
  return writeMessageAtomic(OUTBOUND_DIR, createMessageFilename('out'), payload);
}

export function listInboundMessagesSorted(): string[] {
  fs.mkdirSync(INBOUND_DIR, { recursive: true });
  return fs
    .readdirSync(INBOUND_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => path.join(INBOUND_DIR, file));
}

export function archiveMessage(filePath: string): string {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const baseName = path.basename(filePath);
  const archivedPath = path.join(ARCHIVE_DIR, baseName);
  fs.renameSync(filePath, archivedPath);
  return archivedPath;
}

