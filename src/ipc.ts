import fs from 'node:fs';
import path from 'node:path';
import { BitclawPaths } from './config.js';
import { Direction, InboundEnvelope, OutboundEnvelope } from './types/ipc.js';

export interface PollResult {
  processed: number;
  errors: number;
}

export function random7(): string {
  return Math.random().toString(36).slice(2, 9).padEnd(7, '0').slice(0, 7);
}

export function buildIpcFilename(direction: Direction, unixSeconds = Math.floor(Date.now() / 1000)): string {
  return `${unixSeconds}_${direction}_${random7()}.json`;
}

export function writeJsonAtomic(targetDir: string, fileName: string, payload: unknown): string {
  fs.mkdirSync(targetDir, { recursive: true });
  const finalPath = path.join(targetDir, fileName);
  const tmpPath = `${finalPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tmpPath, finalPath);
  return finalPath;
}

export function sendInbound(paths: BitclawPaths, payload: InboundEnvelope): string {
  const filename = buildIpcFilename('in');
  return writeJsonAtomic(paths.ipcInboundDir, filename, payload);
}

export function listJsonFilesSorted(targetDir: string): string[] {
  if (!fs.existsSync(targetDir)) return [];
  return fs
    .readdirSync(targetDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => path.join(targetDir, file));
}

export function moveToArchive(paths: BitclawPaths, filePath: string, isError = false): string {
  fs.mkdirSync(paths.ipcArchiveDir, { recursive: true });
  const baseName = path.basename(filePath);
  const archivedName = isError ? `error_${baseName}` : baseName;
  const archivedPath = path.join(paths.ipcArchiveDir, archivedName);
  fs.renameSync(filePath, archivedPath);
  return archivedPath;
}

export function pollOutbound(
  paths: BitclawPaths,
  onEvent: (event: OutboundEnvelope) => void | Promise<void>,
): Promise<PollResult> {
  const files = listJsonFilesSorted(paths.ipcOutboundDir);
  let processed = 0;
  let errors = 0;

  const run = async () => {
    for (const filePath of files) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as OutboundEnvelope;
        await onEvent(parsed);
        moveToArchive(paths, filePath);
        processed += 1;
      } catch {
        moveToArchive(paths, filePath, true);
        errors += 1;
      }
    }
    return { processed, errors };
  };

  return run();
}

