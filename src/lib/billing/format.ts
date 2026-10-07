export function formatStorageGb(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${Math.max(1, Math.round(mb))} MB`;
}

export function formatCredits(remaining: number, total: number): string {
  return `${Math.max(0, remaining)} / ${total}`;
}

/** "Includes 5 bought credits, kept at renewal"; null when none of the balance was bought. */
export function boughtCreditsLabel(bought: number): string | null {
  if (bought <= 0) return null;
  return `Includes ${bought} bought ${bought === 1 ? "credit" : "credits"}, kept at renewal`;
}

/**
 * The bought credits left after spending from a balance read with `bought` of them: spending
 * takes the plan's credits first, so they last until the balance is below them.
 */
export function boughtCreditsLeft(bought: number, remaining: number): number {
  return Math.max(0, Math.min(bought, remaining));
}

export function storagePercent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
