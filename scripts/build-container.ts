import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTAINER_IMAGE } from '../src/config.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const projectRoot = path.resolve(path.join(currentDir, '..'));
const dockerfile = path.join(projectRoot, 'container', 'Dockerfile');

const result = spawnSync(
  'docker',
  ['build', '-t', CONTAINER_IMAGE, '-f', dockerfile, projectRoot],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

