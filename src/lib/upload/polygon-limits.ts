/** Polygon cap constants and formatting — no three.js, safe to import from any bundle. */

/** Free-tier (and guest) hard polygon cap — also the default until billing loads. */
export const FREE_MAX_POLYGONS = 100_000;

export function formatPolyCount(count: number): string {
  if (count >= 1_000_000) {
    // Whole millions read better as "2M" than "2.0M" in plan copy.
    const millions = count / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`;
  }
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
  return String(count);
}
