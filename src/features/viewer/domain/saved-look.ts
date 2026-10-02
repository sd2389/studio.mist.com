import {
  buildSceneCatalogIndex,
  type SceneCatalogIndex,
} from "@/features/editor/hooks/useSceneCatalogIndex";
import type { SceneDetail, SceneLook } from "@/lib/api/scenes";
import type { EditCatalogs } from "@/lib/catalog/edit-catalogs";
import type { CatalogItem, CatalogPage } from "@/lib/catalog/types";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import { sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import {
  buildModelConfigFromSlots,
  getDefaultSceneSettings,
} from "@/lib/slot-materials/model-config";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";
import type { FinishId, LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";
import { useUserLibraryStore } from "@/stores/user-library-store";
import { FINISHES } from "../ui/studio-material-groups";

/** A scene's model config, rebuilt from its slot selections for scenes saved before configs had slots. */
export function resolveModelConfig(scene: SceneDetail) {
  return scene.model_config?.slots?.length
    ? scene.model_config
    : buildModelConfigFromSlots(Object.keys(scene.slot_selections ?? {}));
}

/** The finish a look was saved with; anything else, or none, is polished. */
export function savedFinish(value: unknown): FinishId {
  return FINISHES.find((finish) => finish.id === value)?.id ?? "polished";
}

/**
 * Everything the canvas draws a saved scene with, in the studio store's shape: material
 * preset, lighting, finish, per-slot materials and scene settings. The embed shows exactly
 * this; the studio starts editing from it. The finish lives in the store, not in the settings.
 */
export function savedLook(scene: SceneDetail) {
  const { finish, ...sceneSettings } = scene.scene_settings ?? getDefaultSceneSettings();
  const selections = (scene.slot_selections ?? {}) as Record<string, SlotMaterialRef>;
  return {
    preset: scene.material as MaterialPresetId,
    lighting: scene.lighting as LightingPresetId,
    finish: savedFinish(finish),
    slotSelections: sanitizeSlotSelections(selections, resolveModelConfig(scene)),
    sceneSettings,
  };
}

/**
 * Makes the look's catalogue and library materials resolvable by the slot materials. The
 * embed has no catalogue or library access, and the studio's Edit tab loads first pages only.
 */
export function registerLookMaterials(look: SceneLook | null | undefined): void {
  if (!look) return;
  const catalog = useCatalogParamsStore.getState();
  catalog.registerMetals(look.metals);
  catalog.registerGems(look.gems);
  const library = useUserLibraryStore.getState();
  for (const material of look.user_materials) library.upsertMaterial(material);
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
