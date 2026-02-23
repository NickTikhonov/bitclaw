import { spawnSync } from 'node:child_process';
import { CONTAINER_NAME } from '../src/config.js';

const result = spawnSync('docker', ['rm', '-f', CONTAINER_NAME], { stdio: 'inherit' });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

