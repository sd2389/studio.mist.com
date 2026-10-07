import * as THREE from "three";
import { normalizeSlotId } from "@/lib/slot-materials/material-rules";
import type { PersistedModelConfig, SlotKind, SlotRole } from "@/lib/slot-materials/model-config";
import { countMeshTriangles } from "@/lib/upload/count-polygons";

/**
 * What each slot of a converted model is: metal, a stone or accent stones. Look templates pick
 * materials by role (ADR 0006, "Look templates by slot role"), so a "Pave" layer that the
 * segmentation calls a stone gets a stone's material whatever its slot is called. The type is
 * the slot config's (`SlotMaterialConfig.role`).
 */
export type { SlotRole };

export type SlotRoles = {
  roles: Record<string, SlotRole>;
  /** Slots none of whose meshes says what it is: their role comes from the slot's kind. */
  assumed: string[];
};

/** `userData.jewelryRole`, as the loaders and the segmentation set it, to a slot's role. */
const ROLE_OF_JEWELRY_ROLE: Record<string, SlotRole> = { metal: "metal", gem: "gem", "accent-gem": "accent" };
/** The role a slot's kind gives (`inferSlotKind` in model-config.ts); one with no kind is metal. */
const ROLE_OF_KIND: Record<SlotKind, SlotRole> = { metal: "metal", gem: "gem", accent: "accent", default: "metal" };

type Tally = Map<SlotRole, { meshes: number; triangles: number }>;

/** Each slot's meshes' roles, counted, from the slot stamped on each mesh (`devjewelsSlot`). */
function tallyRoles(root: THREE.Object3D): Map<string, Tally> {
  const tallies = new Map<string, Tally>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const role = ROLE_OF_JEWELRY_ROLE[String(object.userData.jewelryRole)];
    const slot = object.userData.devjewelsSlot;
    if (!role || typeof slot !== "string") return;
    const tally = tallies.get(normalizeSlotId(slot)) ?? new Map();
    const counted = tally.get(role) ?? { meshes: 0, triangles: 0 };
    counted.meshes += 1;
    counted.triangles += countMeshTriangles(object);
    tally.set(role, counted);
    tallies.set(normalizeSlotId(slot), tally);
  });
  return tallies;
}

/** The role most of a slot's meshes have; a tie goes to the role with more triangles. */
function majorityRole(tally: Tally): SlotRole {
  const [[role]] = [...tally].sort(([, a], [, b]) => b.meshes - a.meshes || b.triangles - a.triangles);
  return role;
}

/**
 * The role of every slot of `modelConfig`: the majority `jewelryRole` of the meshes stamped with
 * it, or the slot's kind when none of them carries one (a glTF named by hand, say).
 */
export function slotRoles(root: THREE.Object3D, modelConfig: PersistedModelConfig): SlotRoles {
  const tallies = tallyRoles(root);
  const roles: Record<string, SlotRole> = {};
  const assumed: string[] = [];
  for (const slot of modelConfig.slots) {
    const tally = tallies.get(normalizeSlotId(slot.slotId));
    if (tally) {
      roles[slot.slotId] = majorityRole(tally);
    } else {
      roles[slot.slotId] = ROLE_OF_KIND[slot.kind];
      assumed.push(slot.slotId);
    }
  }
  return { roles, assumed };
}
