import * as THREE from "three";
import { mergeIndexed, mergeNonIndexed, transformed } from "@/lib/jewelry-cad/geometry/merge";
import { signedVolume } from "@/lib/jewelry-cad/geometry/mesh-checks";
import type { ProngRecord } from "@/lib/jewelry-cad/parts/prong-head";
import type { StoneModel } from "@/lib/jewelry-cad/stones/stone-model";
import type { BuiltPart, CadGemId, CadMetalId, JewelryRole, ProngContact, SlotName } from "@/lib/jewelry-cad/types";

/**
 * Gathers a piece's parts as they are placed, then merges them into one mesh per slot.
 * Metal parts are closed solids placed by matrix; every stone becomes its own island in
 * its slot's geometry (never instanced — the gem shader needs real triangles per stone).
 */

export type MetalSlot = "Metal 1" | "Heads";

export type StoneGroup = {
  label: string;
  role: Exclude<JewelryRole, "metal">;
  gem: CadGemId;
  model: StoneModel;
  matrices: THREE.Matrix4[];
};

export class PieceCollector {
  private readonly metal = new Map<MetalSlot, THREE.BufferGeometry[]>();
  private readonly volume = new Map<MetalSlot, number>();
  readonly stoneGroups: StoneGroup[] = [];
  readonly prongs: ProngContact[] = [];

  addMetal(slot: MetalSlot, parts: THREE.BufferGeometry[], matrix?: THREE.Matrix4): void {
    const list = this.metal.get(slot) ?? [];
    for (const part of parts) {
      const placed = matrix ? transformed(part, matrix) : part;
      list.push(placed);
      this.volume.set(slot, (this.volume.get(slot) ?? 0) + signedVolume(placed));
    }
    this.metal.set(slot, list);
  }

  addStones(group: StoneGroup): void {
    if (group.matrices.length > 0) this.stoneGroups.push(group);
  }

  addProngs(records: ProngRecord[], matrix: THREE.Matrix4): void {
    for (const p of records) {
      this.prongs.push({
        girdlePoint: p.girdlePoint.clone().applyMatrix4(matrix),
        path: p.path.map((q) => q.clone().applyMatrix4(matrix)),
        radius: p.radius,
        tipCenter: p.tipCenter.clone().applyMatrix4(matrix),
        tipRadius: p.tipRadius,
      });
    }
  }

  metalVolume(slot: MetalSlot): number {
    return this.volume.get(slot) ?? 0;
  }

  hasMetal(slot: MetalSlot): boolean {
    return (this.metal.get(slot)?.length ?? 0) > 0;
  }

  /** Slot per stone group: the primary gem is "Gem 1", accents number in order. */
  stoneSlots(): SlotName[] {
    let accent = 0;
    return this.stoneGroups.map((g) => (g.role === "gem" ? "Gem 1" : (`Accent ${++accent}` as SlotName)));
  }

  toParts(metals: Record<MetalSlot, CadMetalId>): BuiltPart[] {
    const parts: BuiltPart[] = [];
    for (const slot of ["Metal 1", "Heads"] as const) {
      const list = this.metal.get(slot);
      if (!list?.length) continue;
      parts.push({ slot, role: "metal", geometry: mergeIndexed(list), metal: metals[slot] });
    }
    const slots = this.stoneSlots();
    const bySlot = new Map<SlotName, { group: StoneGroup; geometries: THREE.BufferGeometry[] }>();
    this.stoneGroups.forEach((group, i) => {
      const slot = slots[i]!;
      const entry = bySlot.get(slot) ?? { group, geometries: [] };
      for (const m of group.matrices) entry.geometries.push(transformed(group.model.geometry, m));
      bySlot.set(slot, entry);
    });
    for (const [slot, { group, geometries }] of bySlot) {
      parts.push({ slot, role: group.role, geometry: mergeNonIndexed(geometries), gem: group.gem });
    }
    return parts;
  }
}
