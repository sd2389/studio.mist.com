"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateScene } from "@/features/scene";
import type { SceneDetail } from "@/lib/api/scenes";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import {
  applyVariantSnapshot,
  canAddVariant,
  captureVariantSnapshot,
  createVariantId,
  emptyVariantsState,
  findVariant,
  nextVariantName,
  normalizeVariantsState,
  removeVariant,
  renameVariant,
  setActiveVariant,
  upsertVariant,
} from "@/lib/variants/variant-utils";
import type { ModelVariant, SceneVariantsState } from "@/lib/variants/types";
import { MAX_VARIANTS_PER_MODEL } from "@/lib/variants/constants";
import { sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import {
  useMaterialPresetStore,
  type LightingPresetId,
  type MaterialPresetId,
} from "@/stores/material-preset-store";

type UseSceneVariantsArgs = {
  sceneId: number;
  initialScene: SceneDetail;
  modelConfig: PersistedModelConfig;
  onModelConfigChange: (config: PersistedModelConfig) => void;
};

export function useSceneVariants({
  sceneId,
  initialScene,
  modelConfig,
  onModelConfigChange,
}: UseSceneVariantsArgs) {
  const [variantsState, setVariantsState] = useState<SceneVariantsState>(() =>
    normalizeVariantsState(initialScene.variants),
  );
  const persistTimer = useRef<number | null>(null);
  const applyingVariant = useRef(false);

  const preset = useMaterialPresetStore((s) => s.preset);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);

  useEffect(() => {
    setVariantsState(normalizeVariantsState(initialScene.variants));
  }, [initialScene.variants, initialScene.id]);

  const persistVariants = useCallback(
    (next: SceneVariantsState) => {
      if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
      persistTimer.current = window.setTimeout(() => {
        void updateScene(sceneId, { variants: next }).catch(() => undefined);
      }, 350);
    },
    [sceneId],
  );

  const commitVariants = useCallback(
    (next: SceneVariantsState) => {
      setVariantsState(next);
      persistVariants(next);
    },
    [persistVariants],
  );

  const captureCurrentSnapshot = useCallback(() => {
    const safeSelections = sanitizeSlotSelections(
      slotSelections as Record<string, SlotMaterialRef>,
      modelConfig,
    );
    return captureVariantSnapshot({
      material: preset,
      lighting,
      slotSelections: safeSelections,
      sceneSettings,
      modelConfig,
    });
  }, [lighting, modelConfig, preset, sceneSettings, slotSelections]);

  const saveVariant = useCallback(
    (name?: string) => {
      if (!canAddVariant(variantsState.items)) return null;
      const now = new Date().toISOString();
      const variant: ModelVariant = {
        id: createVariantId(),
        name: name?.trim() || nextVariantName(variantsState.items),
        snapshot: captureCurrentSnapshot(),
        createdAt: now,
        updatedAt: now,
      };
      const next = setActiveVariant(upsertVariant(variantsState, variant), variant.id);
      commitVariants(next);
      return variant;
    },
    [captureCurrentSnapshot, commitVariants, variantsState],
  );

  const updateActiveVariant = useCallback(() => {
    const activeId = variantsState.activeVariantId;
    if (!activeId) return false;
    const existing = findVariant(variantsState, activeId);
    if (!existing) return false;
    const updated: ModelVariant = {
      ...existing,
      snapshot: captureCurrentSnapshot(),
      updatedAt: new Date().toISOString(),
    };
    commitVariants(upsertVariant(variantsState, updated));
    return true;
  }, [captureCurrentSnapshot, commitVariants, variantsState]);

  const switchVariant = useCallback(
    (variantId: string | null) => {
      applyingVariant.current = true;
      if (variantId === null) {
        commitVariants(setActiveVariant(variantsState, null));
        applyingVariant.current = false;
        return;
      }
      const variant = findVariant(variantsState, variantId);
      if (!variant) return;
      applyVariantSnapshot(variant.snapshot, modelConfig, { onModelConfigChange });
      commitVariants(setActiveVariant(variantsState, variantId));
      window.setTimeout(() => {
        applyingVariant.current = false;
      }, 0);
    },
    [commitVariants, modelConfig, onModelConfigChange, variantsState],
  );

  const deleteVariant = useCallback(
    (variantId: string) => {
      commitVariants(removeVariant(variantsState, variantId));
    },
    [commitVariants, variantsState],
  );

  const renameVariantById = useCallback(
    (variantId: string, name: string) => {
      commitVariants(renameVariant(variantsState, variantId, name));
    },
    [commitVariants, variantsState],
  );

  return {
    variantsState,
    maxVariants: MAX_VARIANTS_PER_MODEL,
    activeVariantId: variantsState.activeVariantId,
    items: variantsState.items,
    canAdd: canAddVariant(variantsState.items),
    saveVariant,
    updateActiveVariant,
    switchVariant,
    deleteVariant,
    renameVariantById,
    captureCurrentSnapshot,
    isApplyingVariant: () => applyingVariant.current,
  };
}

export { emptyVariantsState, normalizeVariantsState };
