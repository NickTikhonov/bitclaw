import fs from 'node:fs';
import path from 'node:path';

export const IPC_DIR = '/workspace/ipc';
export const INBOUND_DIR = path.join(IPC_DIR, 'inbound');
export const OUTBOUND_DIR = path.join(IPC_DIR, 'outbound');
export const ARCHIVE_DIR = path.join(IPC_DIR, 'archive');

export function random7(): string {
  return Math.random().toString(36).slice(2, 9).padEnd(7, '0').slice(0, 7);
}

export function buildFilename(direction: 'in' | 'out'): string {
  const unixTs = Math.floor(Date.now() / 1000);
  return `${unixTs}_${direction}_${random7()}.json`;
}

export function writeJsonAtomic(targetDir: string, fileName: string, payload: unknown): string {
  fs.mkdirSync(targetDir, { recursive: true });
  const finalPath = path.join(targetDir, fileName);
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tmpPath, finalPath);
  return finalPath;
}

export function writeOutbound(payload: Record<string, unknown>): string {
  return writeJsonAtomic(OUTBOUND_DIR, buildFilename('out'), payload);
}

export function archiveFile(filePath: string, isError = false): string {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const baseName = path.basename(filePath);
  const archivedName = isError ? `error_${baseName}` : baseName;
  const archivedPath = path.join(ARCHIVE_DIR, archivedName);
  fs.renameSync(filePath, archivedPath);
  return archivedPath;
}

export function listInboundFilesSorted(): string[] {
  fs.mkdirSync(INBOUND_DIR, { recursive: true });
  return fs
    .readdirSync(INBOUND_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => path.join(INBOUND_DIR, file));
}

