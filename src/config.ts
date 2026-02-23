import fs from 'node:fs';
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
  logsDir: string;
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
    logsDir: path.join(homeDir, 'logs'),
  };
}

const DEFAULT_AGENT_MD = `# BitClaw Agent

You are BitClaw a capable AI assistant focused on getting things done.

## Communication Style

- Be direct and concise
- Skip unnecessary pleasantries and acknowledgments
- Don't apologize excessively or ask permission for routine tasks
- Use markdown but don't use tables as they are not supported
- State what you're doing, then do it
- If something fails, explain why and suggest alternatives

## Working Approach

- Read this file to understand your current goals and context
- Use the filesystem to maintain notes, track progress, and store artifacts
- Break complex tasks into clear steps
- Test your work when possible
- Update this file when the user asks you to change your behavior
`;

export function ensureBitclawDirs(paths: BitclawPaths): void {
  for (const dir of Object.values(paths)) {
    if (dir !== paths.homeDir) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function ensureWorkspaceAgentFile(paths: BitclawPaths): string {
  const agentMdPath = path.join(paths.workspaceDir, 'AGENT.md');
  if (!fs.existsSync(agentMdPath)) {
    fs.writeFileSync(agentMdPath, DEFAULT_AGENT_MD, 'utf8');
  }
  return agentMdPath;
}

export const CONTAINER_IMAGE = process.env.BITCLAW_CONTAINER_IMAGE ?? 'bitclaw-agent:dev';
export const CONTAINER_NAME = process.env.BITCLAW_CONTAINER_NAME ?? 'bitclaw-agent';
export const IPC_POLL_MS = Number(process.env.BITCLAW_IPC_POLL_MS ?? 400);
