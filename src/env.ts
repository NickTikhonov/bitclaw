import fs from 'node:fs';
import path from 'node:path';

function parseLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const withoutExport = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trim()
    : trimmed;
  const eqIndex = withoutExport.indexOf('=');
  if (eqIndex <= 0) return null;

  const key = withoutExport.slice(0, eqIndex).trim();
  if (!key) return null;

  let rawValue = withoutExport.slice(eqIndex + 1).trim();
  if (!rawValue) return { key, value: '' };

  const quote = rawValue[0];
  if (quote === '"' || quote === "'") {
    const last = rawValue.lastIndexOf(quote);
    if (last > 0) {
      rawValue = rawValue.slice(1, last);
    } else {
      rawValue = rawValue.slice(1);
    }
    return { key, value: rawValue };
  }

  const commentIndex = rawValue.indexOf(' #');
  const value = commentIndex === -1 ? rawValue : rawValue.slice(0, commentIndex).trim();
  return { key, value };
}

export function loadProjectEnv(projectRoot: string): void {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const parsed = parseLine(rawLine);
    if (!parsed) continue;

    if (process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

