import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContainerImage } from '../src/runtime.js';

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const projectRoot = path.resolve(path.join(currentDir, '..'));
buildContainerImage(projectRoot);

