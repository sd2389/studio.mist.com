import * as THREE from "three";
import {
  inferSlotFromCandidates,
  type PersistedSlotTokens,
} from "@/lib/slot-materials/detect-slots";
import {
  buildModelConfigFromSlots,
  type PersistedModelConfig,
} from "@/lib/slot-materials/model-config";

export type LayerRow = {
  rawName: string;
  slotId: string;
  visible: boolean;
};

function collectRawLayerNames(root: THREE.Object3D, slotTokens: PersistedSlotTokens): string[] {
  const names = new Set<string>();
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.name?.trim()) {
      names.add(obj.name.trim());
    }
  });
  if (names.size === 0) {
    for (const slotId of Object.keys(slotTokens)) names.add(slotId);
  }
  if (names.size === 0) names.add("Metal 01");
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function resolveSlotId(rawName: string, slotRenames: Record<string, string>): string {
  if (slotRenames[rawName]) return slotRenames[rawName]!;
  const inferred = inferSlotFromCandidates([rawName]);
  return inferred === "default" ? rawName : inferred;
}

export function buildLayerRows(
  root: THREE.Object3D,
  slotTokens: PersistedSlotTokens,
  slotRenames: Record<string, string>,
  materialProps: Record<string, { visible: boolean }>,
): LayerRow[] {
  return collectRawLayerNames(root, slotTokens).map((rawName) => {
    const slotId = resolveSlotId(rawName, slotRenames);
    return {
      rawName,
      slotId,
      visible: materialProps[slotId]?.visible ?? true,
    };
  });
}

export function rebuildSlotTokens(
  root: THREE.Object3D,
  slotRenames: Record<string, string>,
): PersistedSlotTokens {
  const tokens: PersistedSlotTokens = {};
  const rawNames = collectRawLayerNames(root, {});

  for (const rawName of rawNames) {
    const slotId = resolveSlotId(rawName, slotRenames);
    const list = tokens[slotId] ?? [];
    const token = rawName.trim().toLowerCase();
    if (token && !list.includes(token)) list.push(token);
    tokens[slotId] = list;
  }

  return tokens;
}

export function applyLayerRename(
  modelConfig: PersistedModelConfig,
  root: THREE.Object3D,
  rawName: string,
  nextSlotId: string,
): PersistedModelConfig {
  const slotRenames = { ...(modelConfig.slotRenames ?? {}), [rawName]: nextSlotId.trim() };
  const slotTokens = rebuildSlotTokens(root, slotRenames);
  const slotIds = Object.keys(slotTokens);
  const next = buildModelConfigFromSlots(slotIds, modelConfig.sceneSettings);
  next.slotTokens = slotTokens;
  next.slotRenames = slotRenames;
  next.materialProps = {
    ...(modelConfig.materialProps ?? next.materialProps),
    [nextSlotId.trim()]: modelConfig.materialProps?.[nextSlotId.trim()] ?? { visible: true },
  };
  return next;
}

export function applyLayerVisibility(
  modelConfig: PersistedModelConfig,
  slotId: string,
  visible: boolean,
): PersistedModelConfig {
  return {
    ...modelConfig,
    materialProps: {
      ...(modelConfig.materialProps ?? {}),
      [slotId]: { visible },
    },
  };
}

export function syncModelConfigFromLayers(
  modelConfig: PersistedModelConfig,
  root: THREE.Object3D,
  layers: LayerRow[],
): PersistedModelConfig {
  const slotRenames = { ...(modelConfig.slotRenames ?? {}) };
  for (const layer of layers) {
    if (layer.slotId !== layer.rawName) {
      slotRenames[layer.rawName] = layer.slotId;
    }
  }

  const slotTokens = rebuildSlotTokens(root, slotRenames);
  const slotIds = Object.keys(slotTokens);
  const next = buildModelConfigFromSlots(slotIds, modelConfig.sceneSettings);
  next.slotTokens = slotTokens;
  next.slotRenames = slotRenames;
  next.materialProps = Object.fromEntries(
    layers.map((layer) => [layer.slotId, { visible: layer.visible }]),
  );
  return next;
}
