import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTAINER_NAME } from '../src/config.js';
import { startContainer } from '../src/runtime.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const projectRoot = path.resolve(path.join(currentDir, '..'));
const result = startContainer(projectRoot);

console.log(`Started ${CONTAINER_NAME}`);
console.log(`BITCLAW_HOME: ${result.paths.homeDir}`);
if (!result.hasAuthSecrets) {
  console.warn('Warning: no Claude auth secrets found in env. Agent SDK queries will fail.');
}

