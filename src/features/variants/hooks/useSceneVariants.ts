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
  isVariantLimitError,
  nextVariantName,
  normalizeVariantsState,
  removeVariant,
  renameVariant,
  setActiveVariant,
  upsertVariant,
} from "@/lib/variants/variant-utils";
import type { ModelVariant, SceneVariantsState } from "@/lib/variants/types";
import { sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { useVariantPlan } from "./useVariantPlan";

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
  /** The server's refusal when a save went past the plan's variant cap. */
  const [limitError, setLimitError] = useState<string | null>(null);
  const plan = useVariantPlan();
  const maxVariants = plan?.features.max_variants_per_model ?? null;
  const persistTimer = useRef<number | null>(null);
  /** What the server last accepted; a refused save rolls back to it. */
  const savedState = useRef<SceneVariantsState>(variantsState);
  /** Numbers each save, so only a refusal of the latest one rolls back. */
  const saveSeq = useRef(0);
  const applyingVariant = useRef(false);

  const preset = useMaterialPresetStore((s) => s.preset);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);

  const [previousScene, setPreviousScene] = useState(initialScene);
  if (previousScene.id !== initialScene.id || previousScene.variants !== initialScene.variants) {
    setPreviousScene(initialScene);
    setVariantsState(normalizeVariantsState(initialScene.variants));
    setLimitError(null);
  }

  useEffect(() => {
    savedState.current = normalizeVariantsState(initialScene.variants);
  }, [initialScene.variants]);

  const persistVariants = useCallback(
    (next: SceneVariantsState) => {
      if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
      persistTimer.current = window.setTimeout(() => {
        const seq = ++saveSeq.current;
        updateScene(sceneId, { variants: next })
          .then(() => {
            savedState.current = next;
            setLimitError(null);
          })
          .catch((error: unknown) => {
            // Past the plan's cap the server refuses the save (402): show its reason and undo
            // what it did not keep. Other failures leave the edit for the next save.
            const message = error instanceof Error ? error.message : "";
            if (seq !== saveSeq.current || !isVariantLimitError(message)) return;
            if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
            setVariantsState(savedState.current);
            setLimitError(message);
          });
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
      if (!canAddVariant(variantsState.items, maxVariants)) return null;
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
    [captureCurrentSnapshot, commitVariants, maxVariants, variantsState],
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
    plan,
    limitError,
    activeVariantId: variantsState.activeVariantId,
    items: variantsState.items,
    canAdd: canAddVariant(variantsState.items, maxVariants),
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
