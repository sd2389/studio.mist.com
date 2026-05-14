import * as THREE from "three";

export type SlotId = "Heads" | `Metal ${number}` | `Gem ${number}` | `Accent ${number}` | "default";
export type SlotMap = Map<SlotId, THREE.Mesh[]>;
export type PersistedSlotTokens = Record<string, string[]>;

export function normalizeSlotToken(token: string): SlotId | null {
  const value = token.trim();
  if (!value) return null;

  if (/^heads?$/i.test(value) || /^prongs?$/i.test(value)) return "Heads";

  const metal = value.match(/^metal\s*0*([1-9]\d*)$/i);
  if (metal) return `Metal ${Number(metal[1])}` as const;

  const gem = value.match(/^(gem|stone)\s*0*([1-9]\d*)$/i);
  if (gem) return `Gem ${Number(gem[2])}` as const;

  const accent = value.match(/^accent\s*0*([1-9]\d*)$/i);
  if (accent) return `Accent ${Number(accent[1])}` as const;

  return null;
}

function getCandidates(mesh: THREE.Mesh): string[] {
  const names: string[] = [];
  if (mesh.name) names.push(mesh.name);

  let current: THREE.Object3D | null = mesh.parent;
  let depth = 0;
  while (current && depth < 3) {
    if (current.name) names.push(current.name);
    current = current.parent;
    depth += 1;
  }

  const material = mesh.material;
  if (Array.isArray(material)) {
    for (const mat of material) {
      if (mat?.name) names.push(mat.name);
    }
  } else if (material?.name) {
    names.push(material.name);
  }

  return names;
}

function detectSlotsFromTokens(root: THREE.Object3D, slotTokens: PersistedSlotTokens): SlotMap {
  const normalizedSlots = Object.entries(slotTokens)
    .map(([slot, tokens]) => ({
      slot: normalizeSlotToken(slot) ?? (slot as SlotId),
      tokens: tokens.map((token) => token.toLowerCase()).filter(Boolean),
    }))
    .filter((entry) => entry.tokens.length > 0);

  const slotMap: SlotMap = new Map();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const candidates = getCandidates(obj).map((candidate) => candidate.toLowerCase());
    const matched = normalizedSlots.find(({ tokens }) =>
      candidates.some((candidate) =>
        tokens.some((token) => candidate.includes(token)),
      ),
    );
    const slot = matched?.slot ?? "default";
    const existing = slotMap.get(slot);
    if (existing) {
      existing.push(obj);
      return;
    }
    slotMap.set(slot, [obj]);
  });
  return slotMap;
}

export function inferSlotFromCandidates(candidates: string[]): SlotId {
  for (const candidate of candidates) {
    const direct = normalizeSlotToken(candidate);
    if (direct) return direct;

    // Handle composite names like "Ring_Heads_Main" or "Gem 01 Center".
    const chunks = candidate.split(/[|/_\-:(),]/g).map((part) => part.trim());
    for (const chunk of chunks) {
      const normalized = normalizeSlotToken(chunk);
      if (normalized) return normalized;
    }
  }
  return "default";
}

function inferSlot(mesh: THREE.Mesh): SlotId {
  return inferSlotFromCandidates(getCandidates(mesh));
}

function detectSlotsWithHeuristics(root: THREE.Object3D): SlotMap {
  const slotMap: SlotMap = new Map();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const slot = inferSlot(obj);
    const existing = slotMap.get(slot);
    if (existing) {
      existing.push(obj);
      return;
    }
    slotMap.set(slot, [obj]);
  });
  return slotMap;
}

export function detectSlots(root: THREE.Object3D, slotTokens?: PersistedSlotTokens): SlotMap {
  if (slotTokens && Object.keys(slotTokens).length > 0) {
    const byTokens = detectSlotsFromTokens(root, slotTokens);
    const hasNamedSlots = [...byTokens.keys()].some((slot) => slot !== "default");
    if (hasNamedSlots) return byTokens;
  }
  return detectSlotsWithHeuristics(root);
}
