export function detectUnseenOrderIds(existing: Record<string, number>, orderIds: string[]): string[] {
  const unique = [...new Set(orderIds.filter(Boolean))];
  return unique.filter((id) => existing[id] === undefined);
}
