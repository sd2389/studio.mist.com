import type { MaterialPresetId } from "@/stores/material-preset-store";

export type SceneSettingBucketKey =
  | "ENVIRONMENT-METAL"
  | "ENVIRONMENT-GEM"
  | "GROUND"
  | "BACKGROUND"
  | "VJSON";

export type RenderQualityMode = "standard" | "photometric";

export type SlotKind = "metal" | "gem" | "accent" | "default";

export type SlotMaterialOption = {
  id: MaterialPresetId;
  label: string;
};

export type SlotMaterialConfig = {
  slotId: string;
  label: string;
  kind: SlotKind;
  defaultMaterial: MaterialPresetId;
  materialOptions: SlotMaterialOption[];
};

export type SceneAdvancedSettings = {
  metalEnvRotation?: number;
  metalEnvIntensity?: number;
  gemEnvRotation?: number;
  gemEnvIntensity?: number;
  exposure?: number;
  bloom?: number;
  ao?: boolean;
};

export type ModelTransform = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
};

export type SavedPose = {
  id: string;
  name: string;
  cameraPosition: [number, number, number];
  target: [number, number, number];
  isDefault?: boolean;
};

export type EmbedSettings = {
  showChrome?: boolean;
  autoRotate?: boolean;
  showTitle?: boolean;
  brandingText?: string | null;
  showZoomControls?: boolean;
  showStudioLink?: boolean;
};

export type SceneSettingsBuckets = Record<SceneSettingBucketKey, string | null> & {
  quality_mode?: RenderQualityMode | null;
  advanced?: SceneAdvancedSettings;
  modelTransform?: ModelTransform;
  customBackground?: string | null;
  poses?: SavedPose[];
  activePoseId?: string | null;
  embed?: EmbedSettings;
};

export type PersistedModelConfig = {
  source: "upload-ingest" | "manual";
  slots: SlotMaterialConfig[];
  defaultMaterials: Record<string, MaterialPresetId>;
  materialOptionsBySlot: Record<string, SlotMaterialOption[]>;
  slotTokens?: Record<string, string[]>;
  slotRenames?: Record<string, string>;
  materialProps?: Record<string, { visible: boolean }>;
  sceneSettings: SceneSettingsBuckets;
};

const METAL_OPTIONS: SlotMaterialOption[] = [
  { id: "gold-18k-yellow", label: "18K Yellow" },
  { id: "gold-14k-yellow", label: "14K Yellow" },
  { id: "gold-18k-white", label: "18K White" },
  { id: "gold-14k-white", label: "14K White" },
  { id: "gold-18k-rose", label: "18K Rose" },
  { id: "platinum", label: "Platinum" },
  { id: "silver-sterling", label: "Sterling Silver" },
];

const GEM_OPTIONS: SlotMaterialOption[] = [
  { id: "diamond", label: "Diamond" },
  { id: "diamond-canary", label: "Canary Diamond" },
  { id: "diamond-pink", label: "Pink Diamond" },
  { id: "diamond-blue", label: "Blue Diamond" },
  { id: "moissanite", label: "Moissanite" },
  { id: "ruby", label: "Ruby" },
  { id: "sapphire", label: "Sapphire" },
  { id: "emerald", label: "Emerald" },
];

const DEFAULT_SCENE_SETTINGS: SceneSettingsBuckets = {
  "ENVIRONMENT-METAL": null,
  "ENVIRONMENT-GEM": null,
  GROUND: null,
  BACKGROUND: null,
  VJSON: null,
  quality_mode: "standard",
};

function inferSlotKind(slotId: string): SlotKind {
  if (slotId === "Heads" || slotId.startsWith("Metal")) return "metal";
  if (slotId.startsWith("Gem")) return "gem";
  if (slotId.startsWith("Accent")) return "accent";
  return "default";
}

function inferDefaultMaterial(kind: SlotKind): MaterialPresetId {
  if (kind === "gem" || kind === "accent") return "diamond";
  if (kind === "default") return "gold-14k-yellow";
  return "gold-14k-yellow";
}

function inferOptions(kind: SlotKind): SlotMaterialOption[] {
  if (kind === "gem" || kind === "accent") return GEM_OPTIONS;
  return METAL_OPTIONS;
}

function normalizeSlots(slots: string[]): string[] {
  const unique = Array.from(new Set(slots.map((slot) => slot.trim()).filter(Boolean)));
  if (unique.length === 0 || (unique.length === 1 && unique[0] === "default")) {
    return ["Metal 01"];
  }
  return unique.sort((a, b) => a.localeCompare(b));
}

export function buildModelConfigFromSlots(
  slots: string[],
  sceneSettings: Partial<SceneSettingsBuckets> = {},
): PersistedModelConfig {
  const normalizedSlots = normalizeSlots(slots);
  const slotConfigs: SlotMaterialConfig[] = normalizedSlots.map((slotId) => {
    const kind = inferSlotKind(slotId);
    return {
      slotId,
      label: slotId,
      kind,
      defaultMaterial: inferDefaultMaterial(kind),
      materialOptions: inferOptions(kind),
    };
  });

  const defaultMaterials = Object.fromEntries(
    slotConfigs.map((slot) => [slot.slotId, slot.defaultMaterial]),
  ) as Record<string, MaterialPresetId>;

  const materialOptionsBySlot = Object.fromEntries(
    slotConfigs.map((slot) => [slot.slotId, slot.materialOptions]),
  );

  const materialProps = Object.fromEntries(
    slotConfigs.map((slot) => [slot.slotId, { visible: true }]),
  );

  return {
    source: "upload-ingest",
    slots: slotConfigs,
    defaultMaterials,
    materialOptionsBySlot,
    materialProps,
    sceneSettings: {
      ...DEFAULT_SCENE_SETTINGS,
      ...sceneSettings,
    },
  };
}

export const DEFAULT_MODEL_TRANSFORM: ModelTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
};

export function getDefaultSceneSettings(): SceneSettingsBuckets {
  return { ...DEFAULT_SCENE_SETTINGS };
}

export function getDefaultModelTransform(): ModelTransform {
  return {
    position: { ...DEFAULT_MODEL_TRANSFORM.position },
    rotation: { ...DEFAULT_MODEL_TRANSFORM.rotation },
  };
}
