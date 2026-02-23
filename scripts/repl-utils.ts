export { formatOutboundEvent } from '../src/format.js';

export function isExitCommand(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return normalized === '/exit' || normalized === '/quit';
}

export function isRestartCommand(input: string): boolean {
  return input.trim().toLowerCase() === '/restart';
}

export function isHelpCommand(input: string): boolean {
  return input.trim().toLowerCase() === '/help';
}
