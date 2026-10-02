import * as THREE from "three";
import {
  inferSlotFromCandidates,
  type PersistedSlotTokens,
} from "@/lib/slot-materials/detect-slots";

/** Object and material names in the model — the raw signals slot detection matches on. */
export function collectNamesFromObject(root: THREE.Object3D): string[] {
  const names = new Set<string>();
  root.traverse((obj) => {
    if (obj.name) names.add(obj.name);
    if (!(obj instanceof THREE.Mesh)) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) if (material?.name) names.add(material.name);
  });
  return Array.from(names);
}

/** Group names by the slot they infer ("Gem 01" → Gem 1); names without a slot are dropped. */
export function buildSlotTokensFromNames(names: string[]): PersistedSlotTokens {
  const tokens: PersistedSlotTokens = {};
  for (const name of names) {
    const slot = inferSlotFromCandidates([name]);
    if (slot === "default") continue;
    const list = tokens[slot] ?? [];
    const token = name.trim().toLowerCase();
    if (token && !list.includes(token)) list.push(token);
    tokens[slot] = list;
  }
  return tokens;
}
