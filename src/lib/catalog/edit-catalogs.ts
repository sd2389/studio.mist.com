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
