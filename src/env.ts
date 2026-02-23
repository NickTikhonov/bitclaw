import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

export function loadProjectEnv(projectRoot: string): void {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return;

  dotenv.config({ path: envPath });
}
