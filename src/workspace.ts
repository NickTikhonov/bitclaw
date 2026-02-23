import fs from 'node:fs';
import path from 'node:path';
import { BitclawPaths } from './config.js';

const DEFAULT_AGENT_MD = `# Bitclaw Agent Workspace

This file customizes the container agent behavior for this instance.

- Keep behavior lightweight.
- Keep behavior unit tested.
`;

export function ensureBitclawDirs(paths: BitclawPaths): void {
  fs.mkdirSync(paths.ipcInboundDir, { recursive: true });
  fs.mkdirSync(paths.ipcOutboundDir, { recursive: true });
  fs.mkdirSync(paths.ipcArchiveDir, { recursive: true });
  fs.mkdirSync(paths.sessionsDir, { recursive: true });
  fs.mkdirSync(paths.workspaceDir, { recursive: true });
}

export function ensureWorkspaceAgentFile(paths: BitclawPaths): string {
  const agentMdPath = path.join(paths.workspaceDir, 'AGENT.md');
  if (!fs.existsSync(agentMdPath)) {
    fs.writeFileSync(agentMdPath, DEFAULT_AGENT_MD, 'utf8');
  }
  return agentMdPath;
}

