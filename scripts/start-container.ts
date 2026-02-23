import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTAINER_IMAGE, CONTAINER_NAME, createBitclawPaths } from '../src/config.js';
import { loadProjectEnv } from '../src/env.js';
import { ensureBitclawDirs, ensureWorkspaceAgentFile } from '../src/workspace.js';

const paths = createBitclawPaths();
ensureBitclawDirs(paths);
ensureWorkspaceAgentFile(paths);

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const projectRoot = path.resolve(path.join(currentDir, '..'));
const dockerfile = path.join(projectRoot, 'container', 'Dockerfile');
loadProjectEnv(projectRoot);

const build = spawnSync(
  'docker',
  ['build', '-t', CONTAINER_IMAGE, '-f', dockerfile, projectRoot],
  { stdio: 'inherit' },
);
if (build.status !== 0) process.exit(build.status ?? 1);

spawnSync('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'ignore' });

const secrets: Record<string, string> = {};
if (process.env.ANTHROPIC_API_KEY) {
  secrets.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
}
if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  secrets.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
}
const bootstrap = JSON.stringify({ secrets });

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
    '-v',
    `${paths.ipcDir}:/workspace/ipc`,
    '-v',
    `${paths.workspaceDir}:/workspace/workspace`,
    '-v',
    `${paths.sessionsDir}:/home/node/.claude`,
    '-e',
    `BITCLAW_IPC_POLL_MS=${process.env.BITCLAW_IPC_POLL_MS ?? '400'}`,
    CONTAINER_IMAGE,
  ],
  {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
  },
);

run.stdin.write(bootstrap);
run.stdin.end();
run.unref();

console.log(`Started ${CONTAINER_NAME}`);
console.log(`BITCLAW_HOME: ${paths.homeDir}`);
if (!secrets.ANTHROPIC_API_KEY && !secrets.CLAUDE_CODE_OAUTH_TOKEN) {
  console.warn('Warning: no Claude auth secrets found in env. Agent SDK queries will fail.');
}

