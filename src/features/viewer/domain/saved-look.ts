import {
  buildSceneCatalogIndex,
  type SceneCatalogIndex,
} from "@/lib/catalog/scene-catalog-index";
import type { Scene, SceneLook } from "@/lib/api/scenes";
import type { EditCatalogs } from "@/lib/catalog/edit-catalogs";
import { registerLookMaterials } from "@/lib/catalog/look-materials";
import type { CatalogItem, CatalogPage } from "@/lib/catalog/types";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import { sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import {
  buildModelConfigFromSlots,
  getDefaultSceneSettings,
} from "@/lib/slot-materials/model-config";
import {
  useMaterialPresetStore,
  type FinishId,
  type LightingPresetId,
  type MaterialPresetId,
} from "@/stores/material-preset-store";
import { FINISHES } from "../ui/studio-material-groups";

/**
 * A look as the studio saves it (`persistPayload` in useSavedScene): what a scene stores, and
 * what a render job copies and renders (ADR 0005).
 */
export type LookSnapshot = Pick<Scene, "material" | "lighting" | "slot_selections" | "scene_settings" | "model_config">;

/** A look's model config, rebuilt from its slot selections for scenes saved before configs had slots. */
export function resolveModelConfig(look: LookSnapshot) {
  return look.model_config?.slots?.length
    ? look.model_config
    : buildModelConfigFromSlots(Object.keys(look.slot_selections ?? {}));
}

/** The finish a look was saved with; anything else, or none, is polished. */
export function savedFinish(value: unknown): FinishId {
  return FINISHES.find((finish) => finish.id === value)?.id ?? "polished";
}

/**
 * Everything the canvas draws a saved look with, in the studio store's shape: material
 * preset, lighting, finish, per-slot materials and scene settings. The embed shows exactly
 * this; the studio starts editing from it. The finish lives in the store, not in the settings.
 */
export function savedLook(look: LookSnapshot) {
  const { finish, ...sceneSettings } = look.scene_settings ?? getDefaultSceneSettings();
  const selections = (look.slot_selections ?? {}) as Record<string, SlotMaterialRef>;
  return {
    preset: look.material as MaterialPresetId,
    lighting: look.lighting as LightingPresetId,
    finish: savedFinish(finish),
    slotSelections: sanitizeSlotSelections(selections, resolveModelConfig(look)),
    sceneSettings,
  };
}

/**
 * Puts a saved look in the studio store, with the catalogue and library materials it names
 * (a scene's `look`, a render job's `look_items`), so the canvas draws it.
 */
export function applySavedLook(look: LookSnapshot, items: SceneLook | null | undefined): void {
  registerLookMaterials(items);
  useMaterialPresetStore.setState(savedLook(look));
}

function catalogPage<T extends CatalogItem>(...lists: (readonly T[] | undefined)[]): CatalogPage<T> {
  const items = lists.flatMap((list) => list ?? []);
  return { items, total: items.length, limit: items.length, offset: 0 };
}

/**
 * What a view resolves the saved environments, backdrop and ground against: the catalogue
 * pages the Edit tab browses, plus the items the look itself names.
 */
export function buildLookCatalogIndex(
  catalogs: EditCatalogs | null,
  look: SceneLook | null | undefined,
): SceneCatalogIndex {
  return buildSceneCatalogIndex({
    environments: catalogPage(
      catalogs?.metalEnvironments?.items,
      catalogs?.gemEnvironments?.items,
      look?.environments,
    ),
    backgrounds: catalogPage(catalogs?.backgrounds?.items, look?.backgrounds),
    grounds: catalogPage(catalogs?.grounds?.items, look?.grounds),
    presets: catalogs?.scenePresets,
  });
}
