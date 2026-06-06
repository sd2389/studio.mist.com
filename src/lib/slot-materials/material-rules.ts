import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import {
  isCustomMaterialRef,
  parseCustomMaterialId,
  type SlotMaterialRef,
} from "@/lib/library/custom-material-ref";
import type { PersistedSlotTokens } from "@/lib/slot-materials/detect-slots";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { MaterialPresetId } from "@/stores/material-preset-store";
import { useUserLibraryStore } from "@/stores/user-library-store";

export type SlotSelectionMap = Record<string, SlotMaterialRef>;

function selectionKind(ref: SlotMaterialRef): "metal" | "gem" | "original" {
  if (ref === "original") return "original";
  if (isCustomMaterialRef(ref)) {
    const id = parseCustomMaterialId(ref);
    const item = id ? useUserLibraryStore.getState().getMaterial(id) : undefined;
    if (item?.kind === "gem") return "gem";
    return "metal";
  }
  return isGemPresetId(ref) ? "gem" : "metal";
}

export function normalizeSlotId(slot: string): string {
  if (slot === "Heads") return "Heads";
  const metal = slot.match(/^Metal\s*0*([1-9]\d*)$/i);
  if (metal) return `Metal ${Number(metal[1])}`;
  const gem = slot.match(/^Gem\s*0*([1-9]\d*)$/i);
  if (gem) return `Gem ${Number(gem[1])}`;
  const accent = slot.match(/^Accent\s*0*([1-9]\d*)$/i);
  if (accent) return `Accent ${Number(accent[1])}`;
  return slot;
}

export function isGemSlot(slot: string): boolean {
  const normalized = normalizeSlotId(slot);
  return normalized.startsWith("Gem") || normalized.startsWith("Accent");
}

function normalizedSelections(selections: SlotSelectionMap): SlotSelectionMap {
  const out: SlotSelectionMap = {};
  for (const [slot, preset] of Object.entries(selections)) {
    out[normalizeSlotId(slot)] = preset;
  }
  return out;
}

function slotTokensFor(slot: string, slotTokens?: PersistedSlotTokens): string[] {
  if (!slotTokens) return [];
  const normalizedSlot = normalizeSlotId(slot);
  const byExact = slotTokens[normalizedSlot];
  if (byExact?.length) return byExact;
  const byLoose = Object.entries(slotTokens).find(([slotId]) => normalizeSlotId(slotId) === normalizedSlot)?.[1];
  return byLoose ?? [];
}

function isHeadFamilySlot(slot: string, slotTokens?: PersistedSlotTokens): boolean {
  const normalized = normalizeSlotId(slot).toLowerCase();
  if (normalized === "heads") return true;
  const tokenBlob = slotTokensFor(slot, slotTokens).join(" ").toLowerCase();
  const blob = `${normalized} ${tokenBlob}`;
  return /(head|prong|setting|bezel|claw)/.test(blob);
}

function isBandFamilySlot(slot: string, slotTokens?: PersistedSlotTokens): boolean {
  const normalized = normalizeSlotId(slot).toLowerCase();
  if (normalized === "metal 1") return true;
  const tokenBlob = slotTokensFor(slot, slotTokens).join(" ").toLowerCase();
  const blob = `${normalized} ${tokenBlob}`;
  return /(band|shank|ring|metal 1)/.test(blob);
}

function firstPresetByRole(selections: SlotSelectionMap, role: "metal" | "gem"): SlotMaterialRef | null {
  for (const [slot, preset] of Object.entries(selections)) {
    if (isGemSlot(slot) === (role === "gem")) return preset;
  }
  return null;
}

function firstMetalByFamily(
  selections: SlotSelectionMap,
  slotTokens: PersistedSlotTokens | undefined,
  family: "head" | "band",
): SlotMaterialRef | null {
  for (const [slot, preset] of Object.entries(selections)) {
    if (isGemSlot(slot)) continue;
    const familyMatch = family === "head" ? isHeadFamilySlot(slot, slotTokens) : isBandFamilySlot(slot, slotTokens);
    if (familyMatch) return preset;
  }
  return null;
}

function coerceByRole(slot: string, preset: SlotMaterialRef): SlotMaterialRef {
  if (preset === "original") return preset;
  const gemSlot = isGemSlot(slot);
  const kind = selectionKind(preset);
  if (gemSlot && kind === "metal") return "diamond";
  if (!gemSlot && kind === "gem") return "gold-14k-yellow";
  return preset;
}

export function sanitizeSlotSelections(
  selections: SlotSelectionMap,
  modelConfig?: PersistedModelConfig,
): SlotSelectionMap {
  const normalized = normalizedSelections(selections);
  const allowedSlots = new Set((modelConfig?.slots ?? []).map((slot) => normalizeSlotId(slot.slotId)));
  const out: SlotSelectionMap = {};
  for (const [slot, preset] of Object.entries(normalized)) {
    if (allowedSlots.size > 0 && !allowedSlots.has(slot)) continue;
    out[slot] = coerceByRole(slot, preset);
  }
  return out;
}

export function resolvePresetForSlot(
  slot: string,
  selections: SlotSelectionMap,
  fallbackPreset: MaterialPresetId,
  slotTokens?: PersistedSlotTokens,
): SlotMaterialRef {
  const normalized = normalizedSelections(selections);
  const canonicalSlot = normalizeSlotId(slot);

  const direct = normalized[canonicalSlot];
  if (direct) return coerceByRole(canonicalSlot, direct);

  const gemSlot = isGemSlot(canonicalSlot);
  if (gemSlot) {
    if (isGemPresetId(fallbackPreset)) return fallbackPreset;
    return firstPresetByRole(normalized, "gem") ?? "diamond";
  }

  const primaryHead = firstMetalByFamily(normalized, slotTokens, "head");
  const primaryBand = firstMetalByFamily(normalized, slotTokens, "band");
  const firstMetal = firstPresetByRole(normalized, "metal");
  const metalFallback = !isGemPresetId(fallbackPreset) ? fallbackPreset : "gold-14k-yellow";

  if (isHeadFamilySlot(canonicalSlot, slotTokens)) {
    return primaryHead ?? primaryBand ?? firstMetal ?? metalFallback;
  }

  if (isBandFamilySlot(canonicalSlot, slotTokens)) {
    return primaryBand ?? primaryHead ?? firstMetal ?? metalFallback;
  }

  return firstMetal ?? metalFallback;
}

