import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface McpServerConfig {
  command: string;
  args: string[];
  env: string[]; // Env var names to pull from host .env
}

export interface MountConfig {
  host: string;
  container: string;
  readonly: boolean;
}

export interface BitclawConfig {
  mcpServers: Record<string, McpServerConfig>;
  mounts: MountConfig[];
}

const DEFAULT_CONFIG: BitclawConfig = { mcpServers: {}, mounts: [] };

export function loadConfig(projectRoot: string): BitclawConfig {
  const configPath = path.join(projectRoot, 'bitclaw.config.json');
  if (!fs.existsSync(configPath)) return DEFAULT_CONFIG;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<BitclawConfig>;
    return {
      mcpServers: raw.mcpServers ?? {},
      mounts: raw.mounts ?? [],
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Resolve ~ and env vars in a host path */
export function resolveHostPath(hostPath: string): string {
  if (hostPath.startsWith('~')) {
    return path.join(os.homedir(), hostPath.slice(1));
  }
  return path.resolve(hostPath);
}

/** Build resolved MCP configs with actual env values for bootstrap */
export function resolveMcpServers(
  servers: Record<string, McpServerConfig>,
): Record<string, { command: string; args: string[]; env: Record<string, string> }> {
  const resolved: Record<string, { command: string; args: string[]; env: Record<string, string> }> = {};
  for (const [name, config] of Object.entries(servers)) {
    const env: Record<string, string> = {};
    for (const varName of config.env) {
      const value = process.env[varName];
      if (value) env[varName] = value;
    }
    resolved[name] = { command: config.command, args: config.args, env };
  }
  return resolved;
}

/** Build docker -v flags for extra mounts */
export function buildMountFlags(mounts: MountConfig[]): string[] {
  const flags: string[] = [];
  for (const m of mounts) {
    const resolved = resolveHostPath(m.host);
    const suffix = m.readonly ? ':ro' : '';
    flags.push('-v', `${resolved}:${m.container}${suffix}`);
  }
  return flags;
}
