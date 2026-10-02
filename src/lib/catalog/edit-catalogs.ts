import type { SceneDetail } from "@/lib/api/scenes";
import { fetchSourceCatalogServer } from "@/lib/api/server-fetch";
import type { SourceCatalogPayload } from "@/lib/source-catalog";
import {
  fetchBackgroundsCatalogServer,
  fetchEnvironmentsCatalogServer,
  fetchGemsCatalogServer,
  fetchGroundsCatalogServer,
  fetchMetalsCatalogServer,
  fetchScenePresetsCatalogServer,
} from "@/lib/catalog/load-catalog-server";
import type { BackgroundItem, CatalogPage, EnvironmentItem, GemItem, GroundItem, MetalItem, ScenePresetItem } from "@/lib/catalog/types";
import { fetchUserAssetsServer, fetchUserMaterialsServer } from "@/lib/library/load-library-server";
import type { LibraryPage, UserAssetItem, UserMaterialItem } from "@/lib/library/types";

/** First pages of every catalogue and library the studio's Edit panel browses. */
export type EditCatalogs = {
  source: SourceCatalogPayload | null;
  metals: CatalogPage<MetalItem> | null;
  gems: CatalogPage<GemItem> | null;
  metalEnvironments: CatalogPage<EnvironmentItem> | null;
  gemEnvironments: CatalogPage<EnvironmentItem> | null;
  backgrounds: CatalogPage<BackgroundItem> | null;
  grounds: CatalogPage<GroundItem> | null;
  scenePresets: CatalogPage<ScenePresetItem> | null;
  userMetals: LibraryPage<UserMaterialItem> | null;
  userGems: LibraryPage<UserMaterialItem> | null;
  userBackgrounds: LibraryPage<UserAssetItem> | null;
};

/** Server-side load; a catalogue that fails to load is just empty in the panel. */
export async function loadEditCatalogsServer(): Promise<EditCatalogs> {
  const quiet = <T,>(load: Promise<T>) => load.catch(() => null);
  const [source, metals, gems, metalEnvironments, gemEnvironments, backgrounds, grounds, scenePresets, userMetals, userGems, userBackgrounds] =
    await Promise.all([
      quiet(fetchSourceCatalogServer()),
      quiet(fetchMetalsCatalogServer()),
      quiet(fetchGemsCatalogServer()),
      quiet(fetchEnvironmentsCatalogServer({ env_type: "metal_env" })),
      quiet(fetchEnvironmentsCatalogServer({ env_type: "gem_env" })),
      quiet(fetchBackgroundsCatalogServer()),
      quiet(fetchGroundsCatalogServer()),
      quiet(fetchScenePresetsCatalogServer()),
      quiet(fetchUserMaterialsServer({ kind: "metal" })),
      quiet(fetchUserMaterialsServer({ kind: "gem" })),
      quiet(fetchUserAssetsServer({ asset_type: "background" })),
    ]);
  return { source, metals, gems, metalEnvironments, gemEnvironments, backgrounds, grounds, scenePresets, userMetals, userGems, userBackgrounds };
}

const EMPTY: EditCatalogs = {
  source: null,
  metals: null,
  gems: null,
  metalEnvironments: null,
  gemEnvironments: null,
  backgrounds: null,
  grounds: null,
  scenePresets: null,
  userMetals: null,
  userGems: null,
  userBackgrounds: null,
};

/**
 * Just the catalogues a scene's saved look draws from (environments, background, ground), for
 * views that only display it — the embed. Skipped entirely when the scene uses none of them.
 */
export async function loadLookCatalogsServer(scene: SceneDetail): Promise<EditCatalogs | null> {
  const settings = scene.scene_settings ?? {};
  const uses = (key: string) => Boolean((settings as Record<string, unknown>)[key]);
  if (!["ENVIRONMENT-METAL", "ENVIRONMENT-GEM", "BACKGROUND", "GROUND"].some(uses)) return null;
  const quiet = <T,>(load: Promise<T>) => load.catch(() => null);
  const [metalEnvironments, gemEnvironments, backgrounds, grounds] = await Promise.all([
    uses("ENVIRONMENT-METAL") ? quiet(fetchEnvironmentsCatalogServer({ env_type: "metal_env" })) : null,
    uses("ENVIRONMENT-GEM") ? quiet(fetchEnvironmentsCatalogServer({ env_type: "gem_env" })) : null,
    uses("BACKGROUND") ? quiet(fetchBackgroundsCatalogServer()) : null,
    uses("GROUND") ? quiet(fetchGroundsCatalogServer()) : null,
  ]);
  return { ...EMPTY, metalEnvironments, gemEnvironments, backgrounds, grounds };
}
