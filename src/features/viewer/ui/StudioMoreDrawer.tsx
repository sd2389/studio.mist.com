"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { FinishPreview } from "@/components/ui/finish-preview";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaterialSwatch } from "@/components/ui/material-swatch";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getPresetSwatchColor } from "@/lib/material-swatch";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import type {
  PersistedModelConfig,
  RenderQualityMode,
  SceneSettingBucketKey,
  SceneSettingsBuckets,
} from "@/lib/slot-materials/model-config";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import {
  fetchSourceCatalog,
  type SourceCatalogItem,
  type SourceCatalogPayload,
} from "@/lib/source-catalog";
import { resolvePresetForSlot, sanitizeSlotSelections, type SlotSelectionMap } from "@/lib/slot-materials/material-rules";
import type { FinishId, MaterialPresetId } from "@/stores/material-preset-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import {
  FINISHES,
  mapCatalogItemToPreset,
  MATERIAL_GROUPS,
  prettyName,
  resolveGroupedPreset,
  SCENE_BUCKET_ORDER,
  slotKind,
  type MaterialGroup,
  type SlotId,
} from "@/features/viewer/ui/studio-material-groups";
import {
  buildSlotAliasMap,
  resolveSelectionIsGem,
  resolveSelectionSwatchColor,
  shouldCollapseGemSlots,
} from "@/features/viewer/ui/studio-selection-utils";

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
  const preset = useMaterialPresetStore((s) => s.preset);
  const setPreset = useMaterialPresetStore((s) => s.setPreset);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const setSlotPreset = useMaterialPresetStore((s) => s.setSlotPreset);
  const finish = useMaterialPresetStore((s) => s.finish);
  const setFinish = useMaterialPresetStore((s) => s.setFinish);
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const setSceneSetting = useMaterialPresetStore((s) => s.setSceneSetting);
  const autoRotate = useMaterialPresetStore((s) => s.autoRotate);
  const setAutoRotate = useMaterialPresetStore((s) => s.setAutoRotate);
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

  const collapseGemSlots = useMemo(() => shouldCollapseGemSlots(modelConfig), [modelConfig]);
  const slotAliasMap = useMemo(
    () => buildSlotAliasMap(modelConfig, slotSelections, collapseGemSlots),
    [modelConfig, slotSelections, collapseGemSlots],
  );
  const slotIds = useMemo(() => Object.keys(slotAliasMap), [slotAliasMap]);
  const resolvedActiveSlot = slotIds.includes(activeSlot) ? activeSlot : (slotIds[0] ?? "Metal 1");
  const activePhysicalSlots = useMemo(
    () => slotAliasMap[resolvedActiveSlot] ?? [resolvedActiveSlot],
    [slotAliasMap, resolvedActiveSlot],
  );
  const safeSlotSelections = useMemo(
    () => sanitizeSlotSelections(slotSelections, modelConfig),
    [slotSelections, modelConfig],
  );
  const selectedPresetForActiveSlot = useMemo(() => {
    const selected = resolveGroupedPreset(activePhysicalSlots, safeSlotSelections);
    if (selected) return selected;
    return resolvePresetForSlot(
      resolvedActiveSlot,
      safeSlotSelections,
      preset,
      modelConfig.slotTokens,
    );
  }, [activePhysicalSlots, safeSlotSelections, resolvedActiveSlot, preset, modelConfig.slotTokens]);

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

type MoreMaterialsControlsProps = {
  query: string;
  onQueryChange: (value: string) => void;
  slotIds: string[];
  slotAliasMap: Record<string, string[]>;
  resolvedActiveSlot: string;
  onActiveSlotChange: (slot: SlotId) => void;
  safeSlotSelections: SlotSelectionMap;
  catalog: SourceCatalogPayload | null;
  catalogError: string | null;
  finishApplies: boolean;
  finish: FinishId;
  onFinishChange: (id: FinishId) => void;
  currentColor: string;
};

function MoreMaterialsControls({
  query,
  onQueryChange,
  slotIds,
  slotAliasMap,
  resolvedActiveSlot,
  onActiveSlotChange,
  safeSlotSelections,
  catalog,
  catalogError,
  finishApplies,
  finish,
  onFinishChange,
  currentColor,
}: MoreMaterialsControlsProps) {
  return (
    <section className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search materials"
          className="h-9 border-border/60 bg-muted/40 pl-8 pr-8 text-xs placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:bg-background"
        />
        {query ? (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/60 p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h4 className="font-display text-[12px] italic leading-none text-foreground/95">
            Slot materials
          </h4>
          <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
            Source matched
          </span>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-1.5">
          {slotIds.map((slot) => {
            const active = resolvedActiveSlot === slot;
            const logicalSlots = slotAliasMap[slot] ?? [slot];
            const selectedPreset = resolveGroupedPreset(logicalSlots, safeSlotSelections);
            const isSelectedGem = selectedPreset
              ? resolveSelectionIsGem(selectedPreset)
              : slotKind(slot) === "gem";
            const swatchColor = selectedPreset
              ? resolveSelectionSwatchColor(selectedPreset)
              : "#6b7280";
            return (
              <button
                key={slot}
                type="button"
                onClick={() => onActiveSlotChange(slot)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition-colors",
                  active
                    ? "border-foreground/45 bg-background shadow-sm"
                    : "border-border/70 bg-transparent hover:border-foreground/25 hover:bg-background/70",
                )}
              >
                <span
                  className={cn(
                    "block shrink-0",
                    isSelectedGem ? "size-2.5 rotate-45 rounded-[2px]" : "size-2.5 rounded-full",
                  )}
                  style={{ backgroundColor: swatchColor }}
                />
                <span className="truncate text-[10.5px] font-medium leading-none text-foreground/85">
                  {slot}
                </span>
              </button>
            );
          })}
        </div>
        {catalogError ? (
          <p className="text-[10px] text-destructive">{catalogError}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            {catalog
              ? `${catalog.counts.metals} metals · ${catalog.counts.gems} gems loaded from source snapshot`
              : "Loading source catalog..."}
          </p>
        )}
      </div>

      {finishApplies ? (
        <div className="rounded-2xl border border-border/60 bg-card/60 p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h4 className="font-display text-[12px] italic leading-none text-foreground/95">
              Surface finish
            </h4>
            <span className="text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
              Applied to metal
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {FINISHES.map((f) => {
              const active = finish === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFinishChange(f.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors",
                    active
                      ? "border-foreground/45 bg-background shadow-sm"
                      : "border-transparent bg-transparent hover:border-border/70 hover:bg-background/70",
                  )}
                  aria-pressed={active}
                  title={f.hint}
                >
                  <FinishPreview finish={f.id} color={currentColor} />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span
                      className={cn(
                        "truncate text-[11.5px] font-medium",
                        active ? "text-foreground" : "text-foreground/80",
                      )}
                    >
                      {f.label}
                    </span>
                    <span className="truncate text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                      {f.hint}
                    </span>
                  </span>
                  {active ? (
                    <span
                      className="shrink-0 rounded-full bg-foreground/85 px-1.5 py-0.5 text-[8.5px] font-medium uppercase tracking-[0.16em] text-background"
                      aria-hidden
                    >
                      on
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

type MoreCatalogGridProps = {
  query: string;
  resolvedActiveSlot: string;
  activePhysicalSlots: string[];
  safeSlotSelections: SlotSelectionMap;
  preset: MaterialPresetId;
  modelConfig: PersistedModelConfig;
  slotOptionOverrides: { id: MaterialPresetId; label: string }[];
  catalog: SourceCatalogPayload | null;
  slotCatalogItems: SourceCatalogItem[];
  filteredGroups: MaterialGroup[];
  onApplyPreset: (id: MaterialPresetId) => void;
  onSetGlobalPreset: (id: MaterialPresetId) => void;
};

function MoreCatalogGrid({
  query,
  resolvedActiveSlot,
  activePhysicalSlots,
  safeSlotSelections,
  preset,
  modelConfig,
  slotOptionOverrides,
  catalog,
  slotCatalogItems,
  filteredGroups,
  onApplyPreset,
  onSetGlobalPreset,
}: MoreCatalogGridProps) {
  if (slotOptionOverrides.length > 0) {
    return (
      <section>
        <motion.section
          key={`${resolvedActiveSlot}-model-options`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          aria-label={`${resolvedActiveSlot} persisted materials`}
        >
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <h3 className="font-display text-[13px] italic leading-none text-foreground/95">
              {resolvedActiveSlot}
            </h3>
            <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Persisted options
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {slotOptionOverrides.map((option) => {
              const swatchColor = getPresetSwatchColor(option.id);
              const selected =
                activePhysicalSlots.length > 0 &&
                activePhysicalSlots.every(
                  (slot) =>
                    resolvePresetForSlot(slot, safeSlotSelections, preset, modelConfig.slotTokens) ===
                    option.id,
                );
              const diamond = slotKind(resolvedActiveSlot) === "gem";
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onApplyPreset(option.id)}
                  className={cn(
                    "group flex items-center gap-2 rounded-xl border px-2 py-2 text-left transition-colors",
                    selected
                      ? "border-foreground/45 bg-card shadow-sm"
                      : "border-border/60 bg-card/50 hover:border-foreground/30",
                  )}
                  title={option.label}
                >
                  <span
                    className={cn(
                      "block shrink-0",
                      diamond ? "size-3 rotate-45 rounded-[2px]" : "size-3 rounded-full",
                    )}
                    style={{ backgroundColor: swatchColor }}
                  />
                  <span className="line-clamp-1 text-[10.5px] leading-tight text-foreground/85">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.section>
      </section>
    );
  }

  if (catalog) {
    if (slotCatalogItems.length === 0) {
      return (
        <section>
          <p className="py-4 text-center text-xs text-muted-foreground">
            No source materials match &ldquo;{query}&rdquo;
          </p>
        </section>
      );
    }
    return (
      <section>
        <motion.section
          key={resolvedActiveSlot}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          aria-label={`${resolvedActiveSlot} source materials`}
        >
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <h3 className="font-display text-[13px] italic leading-none text-foreground/95">
              {resolvedActiveSlot}
            </h3>
            <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {slotCatalogItems.length} options
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {slotCatalogItems.map((item) => {
              const mappedPreset = mapCatalogItemToPreset(item, resolvedActiveSlot);
              const swatchColor = getPresetSwatchColor(mappedPreset);
              const selected =
                activePhysicalSlots.length > 0 &&
                activePhysicalSlots.every(
                  (slot) =>
                    resolvePresetForSlot(slot, safeSlotSelections, preset, modelConfig.slotTokens) ===
                    mappedPreset,
                );
              const diamond = slotKind(resolvedActiveSlot) === "gem";
              return (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => onApplyPreset(mappedPreset)}
                  className={cn(
                    "group flex items-center gap-2 rounded-xl border px-2 py-2 text-left transition-colors",
                    selected
                      ? "border-foreground/45 bg-card shadow-sm"
                      : "border-border/60 bg-card/50 hover:border-foreground/30",
                  )}
                  title={`${item.name} · mapped to ${prettyName(mappedPreset)}`}
                >
                  <span
                    className={cn(
                      "block shrink-0",
                      diamond ? "size-3 rotate-45 rounded-[2px]" : "size-3 rounded-full",
                    )}
                    style={{ backgroundColor: swatchColor }}
                  />
                  <span className="line-clamp-1 text-[10.5px] leading-tight text-foreground/85">
                    {item.name}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.section>
      </section>
    );
  }

  if (filteredGroups.length === 0) {
    return (
      <section>
        <p className="py-4 text-center text-xs text-muted-foreground">
          No materials match &ldquo;{query}&rdquo;
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="space-y-5">
        {filteredGroups.map((group, gi) => (
          <motion.section
            key={group.title}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: gi * 0.025, duration: 0.25 }}
            aria-label={group.title}
          >
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
              <h3 className="font-display text-[13px] italic leading-none text-foreground/95">
                {group.title}
              </h3>
              {group.tagline ? (
                <span className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {group.tagline}
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {group.items.map((item) => (
                <MaterialSwatch
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  selected={preset === item.id}
                  onClick={() => onSetGlobalPreset(item.id)}
                />
              ))}
            </div>
          </motion.section>
        ))}
      </div>
    </section>
  );
}

type MoreSceneControlsProps = {
  qualityMode: RenderQualityMode;
  onQualityChange: (mode: RenderQualityMode) => void;
  envOptions: Record<SceneSettingBucketKey, SourceCatalogItem[]>;
  sceneSettings: SceneSettingsBuckets;
  onSceneSettingChange: (key: keyof SceneSettingsBuckets, value: string | null) => void;
  autoRotate: boolean;
  onAutoRotateChange: (value: boolean) => void;
};

function MoreSceneControls({
  qualityMode,
  onQualityChange,
  envOptions,
  sceneSettings,
  onSceneSettingChange,
  autoRotate,
  onAutoRotateChange,
}: MoreSceneControlsProps) {
  return (
    <>
      <section>
        <h3 className="mb-2.5 font-display text-[13px] italic leading-none text-foreground/95">
          Render quality
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onQualityChange("standard")}
            className={cn(
              "rounded-xl border px-3 py-2 text-left transition-colors",
              qualityMode === "standard"
                ? "border-foreground/45 bg-background shadow-sm"
                : "border-border/60 bg-card/40 hover:border-foreground/25",
            )}
          >
            <p className="text-[11px] font-medium text-foreground">Standard</p>
            <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Fast preview
            </p>
          </button>
          <button
            type="button"
            onClick={() => onQualityChange("photometric")}
            className={cn(
              "rounded-xl border px-3 py-2 text-left transition-colors",
              qualityMode === "photometric"
                ? "border-foreground/45 bg-background shadow-sm"
                : "border-border/60 bg-card/40 hover:border-foreground/25",
            )}
          >
            <p className="text-[11px] font-medium text-foreground">Photometric</p>
            <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Catalog realism
            </p>
          </button>
        </div>
      </section>

      <section className="space-y-2.5">
        <h3 className="font-display text-[13px] italic leading-none text-foreground/95">
          Scene buckets
        </h3>
        <div className="space-y-2">
          {SCENE_BUCKET_ORDER.map((bucket) => {
            const bucketItems = envOptions[bucket] ?? [];
            return (
              <div key={bucket} className="rounded-xl border border-border/60 bg-card/60 p-2.5">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {bucket}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSceneSettingChange(bucket, null)}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-left text-[10.5px] transition-colors",
                      sceneSettings[bucket] === null
                        ? "border-foreground/45 bg-background"
                        : "border-border/60 bg-card/40 hover:border-foreground/25",
                    )}
                  >
                    Default
                  </button>
                  {bucketItems.slice(0, 7).map((item) => {
                    const selected = sceneSettings[bucket] === item._id;
                    return (
                      <button
                        key={`${bucket}-${item._id}`}
                        type="button"
                        onClick={() => onSceneSettingChange(bucket, item._id)}
                        className={cn(
                          "rounded-lg border px-2 py-1.5 text-left text-[10.5px] transition-colors",
                          selected
                            ? "border-foreground/45 bg-background"
                            : "border-border/60 bg-card/40 hover:border-foreground/25",
                        )}
                        title={item.name}
                      >
                        <span className="line-clamp-1">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2.5">
        <h3 className="font-display text-[13px] italic leading-none text-foreground/95">Camera</h3>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
          <Label htmlFor="auto-rotate" className="cursor-pointer text-sm text-foreground">
            Auto-rotate
          </Label>
          <Switch id="auto-rotate" checked={autoRotate} onCheckedChange={onAutoRotateChange} />
        </div>
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          Tip · Drag to orbit, scroll to zoom, or use the bottom-right toolbar for precise control.
        </p>
      </section>
    </>
  );
}
