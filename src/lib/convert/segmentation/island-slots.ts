import { isGemShaped, type IslandMetrics } from "./island-metrics";

/** Same vocabulary the studio already reads from `mesh.userData.jewelryRole`. */
export type JewelryRole = "metal" | "gem" | "accent-gem";

export type IslandSlot = { role: JewelryRole; slot: string };

/** Stones within this size ratio of the largest are the main stones ("Gem 1"). */
const MAIN_STONE_SIZE_RATIO = 0.85;
/** Metal islands with at least this share of the largest metal box volume are the main piece. */
const MAJOR_METAL_BOX_SHARE = 0.3;

/** Volume-equivalent size; open stones (name-vouched) fall back to their box. */
function stoneSize(metrics: IslandMetrics): number {
  return Math.cbrt(metrics.volume > 0 ? metrics.volume : metrics.boxVolume);
}

/** Same cut regardless of size: graduated melee still reads as one accent group. */
function isSameCut(a: IslandMetrics, b: IslandMetrics): boolean {
  const facetTolerance = Math.max(1, Math.round(0.1 * Math.max(a.facetCount, b.facetCount)));
  return Math.abs(a.facetCount - b.facetCount) <= facetTolerance &&
    Math.abs(a.sphericity - b.sphericity) <= 0.05;
}

function assignMetalSlots(metrics: IslandMetrics[], metalIds: number[], slots: IslandSlot[]): void {
  const largest = Math.max(0, ...metalIds.map((id) => metrics[id].boxVolume));
  for (const id of metalIds) {
    const major = metrics[id].boxVolume >= largest * MAJOR_METAL_BOX_SHARE;
    slots[id] = { role: "metal", slot: major ? "Metal 1" : "Metal 2" };
  }
}

function clusterByCut(metrics: IslandMetrics[], ids: number[]): number[][] {
  const clusters: number[][] = [];
  for (const id of ids) {
    const cluster = clusters.find((members) => isSameCut(metrics[members[0]], metrics[id]));
    if (cluster) cluster.push(id);
    else clusters.push([id]);
  }
  return clusters;
}

/**
 * Main stones (largest, within 15 % of each other) → "Gem 1". Smaller stones repeated with the
 * same cut → "Accent N" (one slot per cut); a lone smaller stone → "Gem N".
 */
function assignGemSlots(metrics: IslandMetrics[], gemIds: number[], slots: IslandSlot[]): void {
  if (gemIds.length === 0) return;
  const bySize = [...gemIds].sort((a, b) => stoneSize(metrics[b]) - stoneSize(metrics[a]));
  const mainSize = stoneSize(metrics[bySize[0]]) * MAIN_STONE_SIZE_RATIO;
  const smaller: number[] = [];
  for (const id of bySize) {
    if (stoneSize(metrics[id]) >= mainSize) slots[id] = { role: "gem", slot: "Gem 1" };
    else smaller.push(id);
  }
  let accentNumber = 1;
  let gemNumber = 2;
  for (const cluster of clusterByCut(metrics, smaller)) {
    const slot = cluster.length > 1
      ? { role: "accent-gem" as const, slot: `Accent ${accentNumber++}` }
      : { role: "gem" as const, slot: `Gem ${gemNumber++}` };
    for (const id of cluster) slots[id] = slot;
  }
}

/**
 * Slot and role for every island from its shape. `vouchedStones[i]` marks islands whose mesh
 * name says "stone" (see jewelry-names) so they stay gems even when the shape test fails.
 */
export function assignIslandSlots(metrics: IslandMetrics[], vouchedStones: boolean[] = []): IslandSlot[] {
  const slots: IslandSlot[] = metrics.map(() => ({ role: "metal", slot: "Metal 1" }));
  const gemIds: number[] = [];
  const metalIds: number[] = [];
  metrics.forEach((m, id) => (vouchedStones[id] || isGemShaped(m) ? gemIds : metalIds).push(id));
  assignMetalSlots(metrics, metalIds, slots);
  assignGemSlots(metrics, gemIds, slots);
  return slots;
}
