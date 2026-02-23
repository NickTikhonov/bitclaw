import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CONTAINER_IMAGE, CONTAINER_NAME, createBitclawPaths, ensureBitclawDirs, ensureWorkspaceAgentFile, type BitclawPaths } from './config.js';
import { buildMountFlags, loadConfig, resolveMcpServers } from './customisation.js';
import { loadProjectEnv } from './env.js';

export interface RuntimeStartResult {
  paths: BitclawPaths;
  hasAuthSecrets: boolean;
}

export function buildContainerImage(projectRoot: string): void {
  const dockerfile = path.join(projectRoot, 'container', 'Dockerfile');
  const build = spawnSync(
    'docker',
    ['build', '-t', CONTAINER_IMAGE, '-f', dockerfile, projectRoot],
    { stdio: 'inherit' },
  );
  if (build.status !== 0) {
    throw new Error(`docker build failed with status ${build.status ?? 1}`);
  }
}

export function stopContainer(): void {
  spawnSync('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'ignore' });
}

export function startContainer(projectRoot: string): RuntimeStartResult {
  loadProjectEnv(projectRoot);
  const paths = createBitclawPaths();
  ensureBitclawDirs(paths);
  ensureWorkspaceAgentFile(paths);

  const config = loadConfig(projectRoot);

  buildContainerImage(projectRoot);
  stopContainer();

  const secrets: Record<string, string> = {};
  if (process.env.ANTHROPIC_API_KEY) {
    secrets.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    secrets.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  const mcpServers = resolveMcpServers(config.mcpServers);
  const bootstrap = JSON.stringify({ secrets, mcpServers });

  const logFile = path.join(paths.logsDir, 'container.log');
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`\n--- container start ${new Date().toISOString()} ---\n`);

  const extraMounts = buildMountFlags(config.mounts);

  const run = spawn(
    'docker',
    [
      'run',
      '-i',
      '--rm',
      '--name',
      CONTAINER_NAME,
      '-w',
      '/workspace/workspace',
      ...[
        `${paths.ipcDir}:/workspace/ipc`,
        `${paths.workspaceDir}:/workspace/workspace`,
        `${paths.sessionsDir}:/home/node/.claude`,
      ].flatMap((mount) => ['-v', mount]),
      ...extraMounts,
      CONTAINER_IMAGE,
    ],
    {
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  run.stdout.pipe(logStream);
  run.stderr.pipe(logStream);

  run.stdin.write(bootstrap);
  run.stdin.end();
  run.unref();

  return { paths, hasAuthSecrets: !!(secrets.ANTHROPIC_API_KEY || secrets.CLAUDE_CODE_OAUTH_TOKEN) };
}

export function isContainerRunning(): boolean {
  const r = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER_NAME], { encoding: 'utf8' });
  return r.stdout?.trim() === 'true';
}

export function ensureContainer(projectRoot: string): RuntimeStartResult {
  if (isContainerRunning()) {
    loadProjectEnv(projectRoot);
    const paths = createBitclawPaths();
    return { paths, hasAuthSecrets: true };
  }
  return startContainer(projectRoot);
}

export function restartContainer(projectRoot: string): RuntimeStartResult {
  return startContainer(projectRoot);
}

