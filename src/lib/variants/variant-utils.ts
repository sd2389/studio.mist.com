import type {
  ModelVariant,
  ModelVariantSnapshot,
  SceneVariantsState,
  VariantCaptureInput,
  VariantApplyCallbacks,
} from "@/lib/variants/types";
import { MAX_VARIANTS_PER_MODEL } from "@/lib/variants/constants";
import { getDefaultSceneSettings } from "@/lib/slot-materials/model-config";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

export function emptyVariantsState(): SceneVariantsState {
  return { activeVariantId: null, items: [] };
}

export function normalizeVariantsState(raw: unknown): SceneVariantsState {
  if (!raw || typeof raw !== "object") return emptyVariantsState();
  const record = raw as Record<string, unknown>;
  const itemsRaw = Array.isArray(record.items) ? record.items : [];
  const items: ModelVariant[] = itemsRaw
    .map((entry) => normalizeVariant(entry))
    .filter((item): item is ModelVariant => item !== null)
    .slice(0, MAX_VARIANTS_PER_MODEL);

  const activeVariantId =
    typeof record.activeVariantId === "string" &&
    items.some((item) => item.id === record.activeVariantId)
      ? record.activeVariantId
      : null;

  return { activeVariantId, items };
}

function normalizeVariant(raw: unknown): ModelVariant | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.name !== "string") return null;
  const snapshot = normalizeSnapshot(record.snapshot);
  if (!snapshot) return null;
  const now = new Date().toISOString();
  return {
    id: record.id,
    name: record.name.trim() || "Variant",
    snapshot,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now,
  };
}

function normalizeSnapshot(raw: unknown): ModelVariantSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.material !== "string" || typeof record.lighting !== "string") return null;

  const slotSelections: Record<string, SlotMaterialRef> = {};
  if (record.slotSelections && typeof record.slotSelections === "object") {
    for (const [key, value] of Object.entries(record.slotSelections as Record<string, unknown>)) {
      if (typeof value === "string") slotSelections[key] = value as SlotMaterialRef;
    }
  }

  const materialProps: Record<string, { visible: boolean }> = {};
  if (record.materialProps && typeof record.materialProps === "object") {
    for (const [key, value] of Object.entries(record.materialProps as Record<string, unknown>)) {
      if (value && typeof value === "object" && "visible" in value) {
        materialProps[key] = { visible: Boolean((value as { visible?: boolean }).visible) };
      }
    }
  }

  const sceneSettings =
    record.sceneSettings && typeof record.sceneSettings === "object"
      ? ({ ...getDefaultSceneSettings(), ...(record.sceneSettings as object) } as ModelVariantSnapshot["sceneSettings"])
      : getDefaultSceneSettings();

  return {
    material: record.material as MaterialPresetId,
    lighting: record.lighting as LightingPresetId,
    slotSelections,
    sceneSettings,
    materialProps,
  };
}

export function captureVariantSnapshot(input: VariantCaptureInput): ModelVariantSnapshot {
  const materialProps = input.modelConfig.materialProps ?? {};
  return {
    material: input.material,
    lighting: input.lighting,
    slotSelections: { ...input.slotSelections },
    sceneSettings: structuredClone(input.sceneSettings),
    materialProps: structuredClone(materialProps),
  };
}

export function applyVariantSnapshot(
  snapshot: ModelVariantSnapshot,
  modelConfig: VariantCaptureInput["modelConfig"],
  callbacks?: VariantApplyCallbacks,
): VariantCaptureInput["modelConfig"] {
  const store = useMaterialPresetStore.getState();
  store.setPreset(snapshot.material);
  store.setLighting(snapshot.lighting);
  store.replaceSlotSelections({ ...snapshot.slotSelections });
  store.replaceSceneSettings(structuredClone(snapshot.sceneSettings));

  const nextConfig = {
    ...modelConfig,
    materialProps: structuredClone(snapshot.materialProps),
  };
  callbacks?.onModelConfigChange?.(nextConfig);
  return nextConfig;
}

export function createVariantId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `variant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function nextVariantName(items: ModelVariant[]): string {
  const used = new Set(items.map((item) => item.name.toLowerCase()));
  let index = items.length + 1;
  while (used.has(`variant ${index}`)) index += 1;
  return `Variant ${index}`;
}

export function canAddVariant(items: ModelVariant[]): boolean {
  return items.length < MAX_VARIANTS_PER_MODEL;
}

export function upsertVariant(
  state: SceneVariantsState,
  variant: ModelVariant,
): SceneVariantsState {
  const existing = state.items.findIndex((item) => item.id === variant.id);
  const items =
    existing >= 0
      ? state.items.map((item, index) => (index === existing ? variant : item))
      : [...state.items, variant].slice(0, MAX_VARIANTS_PER_MODEL);
  return { ...state, items };
}

export function removeVariant(state: SceneVariantsState, variantId: string): SceneVariantsState {
  const items = state.items.filter((item) => item.id !== variantId);
  const activeVariantId =
    state.activeVariantId === variantId ? null : state.activeVariantId;
  return { activeVariantId, items };
}

export function renameVariant(
  state: SceneVariantsState,
  variantId: string,
  name: string,
): SceneVariantsState {
  const trimmed = name.trim();
  if (!trimmed) return state;
  return {
    ...state,
    items: state.items.map((item) =>
      item.id === variantId
        ? { ...item, name: trimmed, updatedAt: new Date().toISOString() }
        : item,
    ),
  };
}

export function setActiveVariant(
  state: SceneVariantsState,
  variantId: string | null,
): SceneVariantsState {
  if (variantId && !state.items.some((item) => item.id === variantId)) {
    return { ...state, activeVariantId: null };
  }
  return { ...state, activeVariantId: variantId };
}

export function findVariant(
  state: SceneVariantsState,
  variantId: string,
): ModelVariant | undefined {
  return state.items.find((item) => item.id === variantId);
}

export function variantSlug(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").toLowerCase();
}
