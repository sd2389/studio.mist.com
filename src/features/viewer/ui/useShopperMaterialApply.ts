"use client";

import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import {
  useMaterialPresetStore,
  type MaterialPresetId,
} from "@/stores/material-preset-store";
import {
  applyShopperMaterial,
  selectedShopperPreset,
  shopperSlotsForKind,
  type ShopperMaterialKind,
} from "@/features/viewer/domain/shopper-material-apply";

export function useShopperMaterialApply(modelConfig: PersistedModelConfig) {
  const preset = useMaterialPresetStore((s) => s.preset);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const setSlotPreset = useMaterialPresetStore((s) => s.setSlotPreset);
  const setPreset = useMaterialPresetStore((s) => s.setPreset);

  function applyKind(kind: ShopperMaterialKind, nextPreset: MaterialPresetId) {
    applyShopperMaterial({
      kind,
      preset: nextPreset,
      modelConfig,
      setSlotPreset,
      setPreset,
    });
  }

  function selectedFor(kind: ShopperMaterialKind): MaterialPresetId | undefined {
    return selectedShopperPreset(
      kind,
      shopperSlotsForKind(modelConfig, kind),
      slotSelections,
      preset,
    );
  }

  return { applyKind, selectedFor };
}
