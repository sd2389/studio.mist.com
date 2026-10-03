"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSceneByViewerId, updateSceneByViewerId } from "@/features/scene";
import { shouldPersistViewerScene, type ViewerShellVariant } from "@/features/viewer/domain/viewer-scene-persist";
import type { SceneDetail, SceneLook } from "@/lib/api/scenes";
import { sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import {
  buildModelConfigFromSlots,
  getDefaultSceneSettings,
} from "@/lib/slot-materials/model-config";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { registerLookMaterials, resolveModelConfig, savedLook } from "../domain/saved-look";

/** Puts a saved scene's look in the studio store, with its catalogue and library materials. */
function applySavedLook(scene: SceneDetail) {
  registerLookMaterials(scene.look);
  useMaterialPresetStore.setState(savedLook(scene));
}

type UseSavedSceneArgs = {
  modelId: string;
  variant: ViewerShellVariant;
  initialScene: SceneDetail | null;
};

/**
 * The viewer's saved scene: its look goes into the studio store once (from the server
 * render, or fetched by viewer id), and the studio saves later changes back to it.
 */
export function useSavedScene({ modelId, variant, initialScene }: UseSavedSceneArgs) {
  const preset = useMaterialPresetStore((s) => s.preset);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const finish = useMaterialPresetStore((s) => s.finish);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const replaceSceneSettings = useMaterialPresetStore(
    (s) => s.replaceSceneSettings,
  );

  const [modelConfig, setModelConfig] = useState(() =>
    initialScene ? resolveModelConfig(initialScene) : buildModelConfigFromSlots([]),
  );
  const [sceneSku, setSceneSku] = useState<string | null>(
    initialScene?.sku ?? null,
  );
  const [sceneLook, setSceneLook] = useState<SceneLook | null>(initialScene?.look ?? null);
  const [sceneLoaded, setSceneLoaded] = useState(Boolean(initialScene));
  const applyingPersistedState = useRef(false);
  const persistTimer = useRef<number | null>(null);

  useEffect(() => {
    if (initialScene) {
      applyingPersistedState.current = true;
      applySavedLook(initialScene);
      window.setTimeout(() => {
        applyingPersistedState.current = false;
      }, 0);
      return;
    }

    let cancelled = false;
    applyingPersistedState.current = true;
    void getSceneByViewerId(modelId)
      .then((scene) => {
        if (cancelled) return;
        applySavedLook(scene);
        setModelConfig(resolveModelConfig(scene));
        setSceneSku(scene.sku ?? null);
        setSceneLook(scene.look ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setSceneSku(null);
        replaceSceneSettings(getDefaultSceneSettings());
      })
      .finally(() => {
        if (cancelled) return;
        setSceneLoaded(true);
        window.setTimeout(() => {
          applyingPersistedState.current = false;
        }, 0);
      });
    return () => {
      cancelled = true;
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current);
      }
    };
  }, [initialScene, modelId, replaceSceneSettings]);

  const persistPayload = useMemo(
    () => ({
      material: preset,
      lighting,
      model_config: modelConfig,
      slot_selections: sanitizeSlotSelections(slotSelections, modelConfig),
      // The finish is saved with the look, so the embed shows it too.
      scene_settings: { ...sceneSettings, finish },
    }),
    [finish, lighting, modelConfig, preset, sceneSettings, slotSelections],
  );

  useEffect(() => {
    if (!shouldPersistViewerScene(variant) || modelId === "mist-solitaire") return;
    if (!sceneLoaded || applyingPersistedState.current) return;
    if (persistTimer.current !== null)
      window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void updateSceneByViewerId(modelId, persistPayload).catch(
        () => undefined,
      );
    }, 350);
  }, [modelId, persistPayload, sceneLoaded, variant]);

  return { modelConfig, setModelConfig, sceneSku, sceneLook };
}
