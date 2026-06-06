"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { updateScene } from "@/features/scene";
import {
  hydrateEditorSceneStore,
  resolveModelConfigFromScene,
} from "@/features/editor/lib/hydrate-editor-scene";
import {
  buildSceneCatalogIndex,
  lookupBackground,
  lookupEnvironment,
  lookupGround,
  type SceneCatalogInitial,
} from "@/features/editor/hooks/useSceneCatalogIndex";
import type { SceneDetail } from "@/lib/api/scenes";
import { modelExtFromUrl } from "@/lib/model-key";
import { resolveModelUrl } from "@/lib/model-url";
import { fetchSourceCatalog, type SourceCatalogPayload } from "@/lib/source-catalog";
import { sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import {
  useMaterialPresetStore,
  type LightingPresetId,
  type MaterialPresetId,
} from "@/stores/material-preset-store";

type UseEditorSceneStateArgs = {
  sceneId: number;
  viewerId: string;
  initialScene: SceneDetail;
  initialCatalog?: SourceCatalogPayload | null;
  initialSceneCatalog?: SceneCatalogInitial;
};

export function useEditorSceneState({
  sceneId,
  viewerId,
  initialScene,
  initialCatalog = null,
  initialSceneCatalog = {},
}: UseEditorSceneStateArgs) {
  const modelUrl = initialScene.model_url ?? resolveModelUrl(viewerId);

  const preset = useMaterialPresetStore((s) => s.preset);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const autoRotate = useMaterialPresetStore((s) => s.autoRotate);

  const hydratedRef = useRef(false);
  if (!hydratedRef.current) {
    hydrateEditorSceneStore(initialScene);
    hydratedRef.current = true;
  }

  const [modelConfig, setModelConfig] = useState(() => resolveModelConfigFromScene(initialScene));
  const [catalog, setCatalog] = useState<SourceCatalogPayload | null>(initialCatalog);
  const applyingPersistedState = useRef(true);
  const persistTimer = useRef<number | null>(null);

  const sceneCatalogIndex = useMemo(
    () => buildSceneCatalogIndex(initialSceneCatalog),
    [initialSceneCatalog],
  );

  useEffect(() => {
    const ext = modelExtFromUrl(modelUrl);
    if (ext === "glb" || ext === "gltf") {
      void useGLTF.preload(modelUrl);
    }
  }, [modelUrl]);

  useEffect(() => {
    if (initialCatalog) return;
    let mounted = true;
    void fetchSourceCatalog()
      .then((payload) => {
        if (!mounted) return;
        setCatalog(payload);
      })
      .catch(() => {
        if (!mounted) return;
        setCatalog(null);
      });
    return () => {
      mounted = false;
    };
  }, [initialCatalog]);

  useEffect(() => {
    applyingPersistedState.current = true;
    hydrateEditorSceneStore(initialScene);
    setModelConfig(resolveModelConfigFromScene(initialScene));
    window.setTimeout(() => {
      applyingPersistedState.current = false;
    }, 0);

    return () => {
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current);
      }
    };
  }, [initialScene]);

  const persistPayload = useMemo(
    () => ({
      material: preset,
      lighting,
      model_config: modelConfig,
      slot_selections: sanitizeSlotSelections(slotSelections, modelConfig),
      scene_settings: sceneSettings,
    }),
    [lighting, modelConfig, preset, sceneSettings, slotSelections],
  );

  const resolvedSceneSettings = useMemo(() => {
    if (!catalog?.scenes) return sceneSettings;
    const indexById = new Map(catalog.scenes.map((item) => [item._id, item.value ?? ""]));
    const resolveValue = (value: string | null) => {
      if (!value) return null;
      if (value.includes("/") || value.includes(".")) return value;
      const mapped = indexById.get(value);
      return mapped || value;
    };
    return {
      ...sceneSettings,
      "ENVIRONMENT-METAL": resolveValue(sceneSettings["ENVIRONMENT-METAL"]),
      "ENVIRONMENT-GEM": resolveValue(sceneSettings["ENVIRONMENT-GEM"]),
      GROUND: resolveValue(sceneSettings.GROUND),
      BACKGROUND: resolveValue(sceneSettings.BACKGROUND),
      VJSON: resolveValue(sceneSettings.VJSON),
      quality_mode: sceneSettings.quality_mode ?? "standard",
    };
  }, [catalog, sceneSettings]);

  const resolvedSceneCatalog = useMemo(
    () => ({
      metalEnvironment: lookupEnvironment(sceneCatalogIndex, sceneSettings["ENVIRONMENT-METAL"]),
      gemEnvironment: lookupEnvironment(sceneCatalogIndex, sceneSettings["ENVIRONMENT-GEM"]),
      backgroundItem: lookupBackground(sceneCatalogIndex, sceneSettings.BACKGROUND),
      groundItem: lookupGround(sceneCatalogIndex, sceneSettings.GROUND),
    }),
    [sceneCatalogIndex, sceneSettings],
  );

  useEffect(() => {
    if (applyingPersistedState.current) return;
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void updateScene(sceneId, persistPayload).catch(() => undefined);
    }, 350);
  }, [persistPayload, sceneId]);

  return {
    modelUrl,
    viewerId,
    preset,
    lighting,
    autoRotate,
    modelConfig,
    setModelConfig,
    resolvedSceneSettings,
    resolvedSceneCatalog,
  };
}
