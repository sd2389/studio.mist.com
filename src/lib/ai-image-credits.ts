/** "12 / 25"; a balance above the plan's allotment (top-ups, an older plan) shows on its own. */
export function formatAiCredits(remaining: number, total: number): string {
  if (remaining > total) return String(remaining);
  return `${Math.max(0, remaining)} / ${total}`;
}
