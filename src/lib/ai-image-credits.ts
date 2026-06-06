export function formatAiCredits(remaining: number, total: number): string {
  return `${Math.max(0, remaining)} / ${total}`;
}
