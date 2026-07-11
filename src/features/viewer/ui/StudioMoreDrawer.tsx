"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import type {
  PersistedModelConfig,
  RenderQualityMode,
  SceneSettingBucketKey,
} from "@/lib/slot-materials/model-config";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import {
  fetchSourceCatalog,
  type SourceCatalogItem,
  type SourceCatalogPayload,
} from "@/lib/source-catalog";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import {
  MATERIAL_GROUPS,
  SCENE_BUCKET_ORDER,
  slotKind,
  type SlotId,
} from "@/features/viewer/ui/studio-material-groups";
import { resolveSelectionSwatchColor } from "@/features/viewer/ui/studio-selection-utils";
import { useStudioSlotContext } from "@/features/viewer/ui/useStudioSlotContext";
import { MoreMaterialsControls } from "@/features/viewer/ui/MoreMaterialsControls";
import { MoreCatalogGrid } from "@/features/viewer/ui/MoreCatalogGrid";
import { MoreSceneControls } from "@/features/viewer/ui/MoreSceneControls";

type StudioMoreDrawerProps = {
  modelConfig?: PersistedModelConfig;
  activeSlot: SlotId;
  onActiveSlotChange: (slot: SlotId) => void;
  className?: string;
};

export function StudioMoreDrawer({
  modelConfig = buildModelConfigFromSlots([]),
  activeSlot,
  onActiveSlotChange,
  className,
}: StudioMoreDrawerProps) {
  const setPreset = useMaterialPresetStore((s) => s.setPreset);
  const setSlotPreset = useMaterialPresetStore((s) => s.setSlotPreset);
  const finish = useMaterialPresetStore((s) => s.finish);
  const setFinish = useMaterialPresetStore((s) => s.setFinish);
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const setSceneSetting = useMaterialPresetStore((s) => s.setSceneSetting);
  const autoRotate = useMaterialPresetStore((s) => s.autoRotate);
  const setAutoRotate = useMaterialPresetStore((s) => s.setAutoRotate);

  const {
    preset,
    slotAliasMap,
    slotIds,
    resolvedActiveSlot,
    activePhysicalSlots,
    safeSlotSelections,
    selectedPresetForActiveSlot,
  } = useStudioSlotContext({ modelConfig, activeSlot });

  const finishApplies = preset !== "original" && !isGemPresetId(preset);
  const qualityMode: RenderQualityMode =
    sceneSettings.quality_mode === "photometric" ? "photometric" : "standard";

  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<SourceCatalogPayload | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetchSourceCatalog()
      .then((payload) => {
        if (!mounted) return;
        setCatalog(payload);
        setCatalogError(null);
      })
      .catch((error) => {
        if (!mounted) return;
        setCatalogError(error instanceof Error ? error.message : "Failed to load source catalog");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const trimmedQuery = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!trimmedQuery) return MATERIAL_GROUPS;
    return MATERIAL_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((it) => it.label.toLowerCase().includes(trimmedQuery)),
    })).filter((g) => g.items.length > 0);
  }, [trimmedQuery]);

  const slotCatalogItems = useMemo(() => {
    if (!catalog) return [] as SourceCatalogItem[];
    const source = slotKind(resolvedActiveSlot) === "gem" ? catalog.gems : catalog.metals;
    if (!trimmedQuery) return source;
    return source.filter((item) => item.name.toLowerCase().includes(trimmedQuery));
  }, [catalog, resolvedActiveSlot, trimmedQuery]);

  const slotOptionOverrides = useMemo(() => {
    for (const slot of activePhysicalSlots) {
      const options = modelConfig.materialOptionsBySlot[slot];
      if (options?.length) return options;
    }
    return [];
  }, [modelConfig.materialOptionsBySlot, activePhysicalSlots]);

  const envOptions = useMemo<Record<SceneSettingBucketKey, SourceCatalogItem[]>>(() => {
    if (!catalog?.scenes) {
      return {
        "ENVIRONMENT-METAL": [],
        "ENVIRONMENT-GEM": [],
        GROUND: [],
        BACKGROUND: [],
        VJSON: [],
      } as Record<SceneSettingBucketKey, SourceCatalogItem[]>;
    }
    const byBucket = (bucket: SceneSettingBucketKey): SourceCatalogItem[] => {
      const token = bucket.toLowerCase().replace("-", " ");
      const filtered = catalog.scenes.filter((item) =>
        `${item.type} ${item.category} ${item.name}`.toLowerCase().includes(token),
      );
      return filtered.length ? filtered : catalog.scenes;
    };
    return Object.fromEntries(SCENE_BUCKET_ORDER.map((bucket) => [bucket, byBucket(bucket)])) as Record<
      SceneSettingBucketKey,
      SourceCatalogItem[]
    >;
  }, [catalog]);

  const currentColor = resolveSelectionSwatchColor(selectedPresetForActiveSlot);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4",
        className,
      )}
    >
      <MoreMaterialsControls
        query={query}
        onQueryChange={setQuery}
        slotIds={slotIds}
        slotAliasMap={slotAliasMap}
        resolvedActiveSlot={resolvedActiveSlot}
        onActiveSlotChange={onActiveSlotChange}
        safeSlotSelections={safeSlotSelections}
        catalog={catalog}
        catalogError={catalogError}
        finishApplies={finishApplies}
        finish={finish}
        onFinishChange={setFinish}
        currentColor={currentColor}
      />

      <MoreCatalogGrid
        query={query}
        resolvedActiveSlot={resolvedActiveSlot}
        activePhysicalSlots={activePhysicalSlots}
        safeSlotSelections={safeSlotSelections}
        preset={preset}
        modelConfig={modelConfig}
        slotOptionOverrides={slotOptionOverrides}
        catalog={catalog}
        slotCatalogItems={slotCatalogItems}
        filteredGroups={filteredGroups}
        onApplyPreset={(id) => {
          for (const slot of activePhysicalSlots) setSlotPreset(slot, id);
          setPreset(id);
        }}
        onSetGlobalPreset={setPreset}
      />

      <MoreSceneControls
        qualityMode={qualityMode}
        onQualityChange={(mode) => setSceneSetting("quality_mode", mode)}
        envOptions={envOptions}
        sceneSettings={sceneSettings}
        onSceneSettingChange={setSceneSetting}
        autoRotate={autoRotate}
        onAutoRotateChange={setAutoRotate}
      />
    </div>
  );
}
