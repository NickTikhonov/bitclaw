import os from 'node:os';
import path from 'node:path';

export interface BitclawPaths {
  homeDir: string;
  ipcDir: string;
  ipcInboundDir: string;
  ipcOutboundDir: string;
  ipcArchiveDir: string;
  sessionsDir: string;
  workspaceDir: string;
}

export function resolveBitclawHomeDir(): string {
  const raw = process.env.BITCLAW_HOME?.trim();
  if (!raw) {
    return path.join(os.homedir(), '.bitclaw');
  }
  if (raw.startsWith('~')) {
    return path.join(os.homedir(), raw.slice(1));
  }
  return path.resolve(raw);
}

export function createBitclawPaths(homeDir = resolveBitclawHomeDir()): BitclawPaths {
  return {
    homeDir,
    ipcDir: path.join(homeDir, 'ipc'),
    ipcInboundDir: path.join(homeDir, 'ipc', 'inbound'),
    ipcOutboundDir: path.join(homeDir, 'ipc', 'outbound'),
    ipcArchiveDir: path.join(homeDir, 'ipc', 'archive'),
    sessionsDir: path.join(homeDir, 'sessions', '.claude'),
    workspaceDir: path.join(homeDir, 'workspace'),
  };
}

export const CONTAINER_IMAGE = process.env.BITCLAW_CONTAINER_IMAGE ?? 'bitclaw-agent:dev';
export const CONTAINER_NAME = process.env.BITCLAW_CONTAINER_NAME ?? 'bitclaw-agent';
export const IPC_POLL_MS = Number(process.env.BITCLAW_IPC_POLL_MS ?? 400);

