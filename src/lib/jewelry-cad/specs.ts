import * as THREE from "three";
import type { PieceCollector } from "@/lib/jewelry-cad/pieces/collector";
import { CAD_METALS, metalWeightGrams } from "@/lib/jewelry-cad/units/metals";
import { ringSizeRow, usSizeToInnerDiameterMm } from "@/lib/jewelry-cad/units/ring-size";
import type { BuiltPart, CadMetalId, JewelryDesign, JewelrySpecs, MetalSpec, StoneGroupSpec } from "@/lib/jewelry-cad/types";

/**
 * Spec sheet for a built piece: metal volume and weight per metal slot, stone counts and
 * carat totals, overall dimensions, and ring sizing.
 *
 * Volumes come from the closed metal solids. Parts overlap where they are joined (prong
 * feet in the base ring, beads in the band), so weights run a few percent heavy — the
 * direction a caster wants an estimate to err.
 */

function round(n: number, places: number): number {
  const k = 10 ** places;
  return Math.round(n * k) / k;
}

export function resolveHeadMetal(design: JewelryDesign): CadMetalId {
  return design.headMetal === "match" ? design.metal : design.headMetal;
}

function metalSpecs(design: JewelryDesign, collector: PieceCollector): MetalSpec[] {
  const out: MetalSpec[] = [];
  const bySlot = { "Metal 1": design.metal, Heads: resolveHeadMetal(design) } as const;
  for (const slot of ["Metal 1", "Heads"] as const) {
    if (!collector.hasMetal(slot)) continue;
    const volumeMm3 = collector.metalVolume(slot);
    out.push({ slot, metal: bySlot[slot], volumeMm3: round(volumeMm3, 1), grams: round(metalWeightGrams(volumeMm3, bySlot[slot]), 2) });
  }
  return out;
}

function stoneSpecs(collector: PieceCollector): StoneGroupSpec[] {
  const slots = collector.stoneSlots();
  return collector.stoneGroups.map((g, i) => ({
    slot: slots[i]!,
    label: g.label,
    cut: g.model.cut,
    gem: g.gem,
    count: g.matrices.length,
    caratEach: round(g.model.carat, 3),
    lengthMm: round(g.model.length, 2),
    widthMm: round(g.model.width, 2),
    depthMm: round(g.model.tableY - g.model.culetY, 2),
  }));
}

function boundsOf(parts: BuiltPart[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  return box;
}

export function computeSpecs(design: JewelryDesign, collector: PieceCollector, parts: BuiltPart[], bandThickness: number): JewelrySpecs {
  const metals = metalSpecs(design, collector);
  const stones = stoneSpecs(collector);
  const box = boundsOf(parts);
  const size = box.getSize(new THREE.Vector3());
  const volume = metals.reduce((s, m) => s + m.volumeMm3, 0);
  const specs: JewelrySpecs = {
    metals,
    metalVolumeMm3: round(volume, 1),
    metalGrams: round(metals.reduce((s, m) => s + m.grams, 0), 2),
    weightsByMetal: CAD_METALS.map((m) => ({ metal: m.id, grams: round(metalWeightGrams(volume, m.id), 2) })),
    stones,
    stoneCount: stones.reduce((s, g) => s + g.count, 0),
    totalCarat: round(stones.reduce((s, g) => s + g.count * g.caratEach, 0), 2),
    sizeMm: { x: round(size.x, 2), y: round(size.y, 2), z: round(size.z, 2) },
  };
  if (design.kind === "ring") {
    const row = ringSizeRow(design.ringSize);
    const inner = usSizeToInnerDiameterMm(design.ringSize) / 2;
    specs.ring = {
      usSize: row.us,
      innerDiameterMm: row.diameterMm,
      circumferenceMm: row.circumferenceMm,
      eu: row.eu,
      bandWidthMm: round(design.bandWidth, 2),
      bandThicknessMm: round(bandThickness, 2),
      settingHeightMm: round(box.max.y - inner, 2),
    };
  }
  return specs;
}
