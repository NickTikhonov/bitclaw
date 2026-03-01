export function log(message: string): void {
  console.error(`${new Date().toISOString()} [host] ${message}`);
}
