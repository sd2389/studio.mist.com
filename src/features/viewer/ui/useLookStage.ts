"use client";

import { useEffect, useMemo, useState } from "react";
import type { SceneLook } from "@/lib/api/scenes";
import type { EditCatalogs } from "@/lib/catalog/edit-catalogs";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { fetchSourceCatalog, type SourceCatalogPayload } from "@/lib/source-catalog";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { lookStage, type LookStage } from "../domain/look-stage";
import { buildLookCatalogIndex } from "../domain/saved-look";

type UseLookStageArgs = {
  modelUrl: string;
  modelConfig: PersistedModelConfig;
  /** Catalogue pages the studio's Edit tab browses; null in the embed and the render harness. */
  catalogs: EditCatalogs | null;
  /** The catalogue items and library materials the look names: a scene's `look`, a job's `look_items`. */
  lookItems: SceneLook | null | undefined;
};

/**
 * The look in the studio store, as `ViewerStage` props. The studio, the embed and the render
 * harness all turn a look into a stage with this hook, so all three draw it the same way.
 */
export function useLookStage({ modelUrl, modelConfig, catalogs, lookItems }: UseLookStageArgs): LookStage {
  const preset = useMaterialPresetStore((s) => s.preset);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const [sourceCatalog, setSourceCatalog] = useState<SourceCatalogPayload | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetchSourceCatalog()
      .then((payload) => {
        if (mounted) setSourceCatalog(payload);
      })
      .catch(() => {
        if (mounted) setSourceCatalog(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Catalogue environments, background and ground the look names, from the look or the Edit tab.
  const catalog = useMemo(() => buildLookCatalogIndex(catalogs, lookItems), [catalogs, lookItems]);
  return useMemo(
    () =>
      lookStage({ modelUrl, preset, lighting, modelConfig, sceneSettings, catalog, sourceScenes: sourceCatalog?.scenes }),
    [modelUrl, preset, lighting, modelConfig, sceneSettings, catalog, sourceCatalog],
  );
}
