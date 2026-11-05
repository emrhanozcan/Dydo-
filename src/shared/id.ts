export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomUUID()}`;
}
