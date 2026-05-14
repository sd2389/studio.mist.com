"use client";

import {
  Camera,
  Download,
  Loader2,
  Maximize2,
  Moon,
  RotateCcw,
  Search,
  Sparkles,
  Sun,
  SunDim,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaterialSwatch } from "@/components/ui/material-swatch";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getPresetSwatchColor, isTransmissive } from "@/lib/material-swatch";
import { captureFrameToDataUrl } from "@/stores/screenshot-store";
import type { FinishId, LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import { FinishPreview } from "@/components/ui/finish-preview";
import type {
  PersistedModelConfig,
  SceneSettingBucketKey,
} from "@/lib/slot-materials/model-config";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import {
  fetchGemoraCatalog,
  mapGemoraGemToPreset,
  mapGemoraMetalToPreset,
  type GemoraCatalogItem,
  type GemoraCatalogPayload,
} from "@/lib/gemora-catalog";

type MaterialEntry = { id: MaterialPresetId; label: string };
type MaterialGroup = { title: string; tagline?: string; items: MaterialEntry[] };
type SlotId = string;

const SCENE_BUCKET_ORDER: SceneSettingBucketKey[] = [
  "ENVIRONMENT-METAL",
  "ENVIRONMENT-GEM",
  "GROUND",
  "BACKGROUND",
  "VJSON",
];

const MATERIAL_GROUPS: MaterialGroup[] = [
  {
    title: "Yellow Golds",
    tagline: "24K → 9K",
    items: [
      { id: "gold-24k", label: "24K" },
      { id: "gold-22k", label: "22K" },
      { id: "gold-18k-yellow", label: "18K" },
      { id: "gold-14k-yellow", label: "14K" },
      { id: "gold-10k-yellow", label: "10K" },
      { id: "gold-9k-yellow", label: "9K" },
    ],
  },
  {
    title: "White Metals",
    items: [
      { id: "gold-18k-white", label: "18K White" },
      { id: "gold-14k-white", label: "14K White" },
      { id: "gold-10k-white", label: "10K White" },
      { id: "platinum", label: "Platinum" },
      { id: "silver-sterling", label: "Sterling" },
      { id: "titanium", label: "Titanium" },
      { id: "rhodium-black", label: "Black Rhodium" },
    ],
  },
  {
    title: "Rose & Red Golds",
    tagline: "Cu-alloyed",
    items: [
      { id: "gold-18k-rose", label: "18K Rose" },
      { id: "gold-14k-rose", label: "14K Rose" },
      { id: "gold-red-light", label: "Light Red" },
      { id: "gold-red", label: "Red" },
    ],
  },
  {
    title: "Speciality Golds",
    tagline: "Ag / Pd alloys",
    items: [
      { id: "gold-warm", label: "Warm" },
      { id: "gold-sand", label: "Sand" },
      { id: "gold-green", label: "Green" },
      { id: "gold-grey", label: "Grey" },
    ],
  },
  {
    title: "Diamond Family",
    tagline: "D-colour & fancies",
    items: [
      { id: "diamond", label: "D Colour" },
      { id: "diamond-canary", label: "Canary" },
      { id: "diamond-pink", label: "Pink" },
      { id: "diamond-blue", label: "Blue" },
      { id: "diamond-champagne", label: "Champagne" },
      { id: "diamond-cognac", label: "Cognac" },
      { id: "diamond-black", label: "Black" },
      { id: "moissanite", label: "Moissanite" },
      { id: "zircon", label: "Zircon" },
    ],
  },
  {
    title: "Coloured Gems",
    items: [
      { id: "ruby", label: "Ruby" },
      { id: "sapphire", label: "Sapphire" },
      { id: "emerald", label: "Emerald" },
      { id: "spinel", label: "Spinel" },
      { id: "tanzanite", label: "Tanzanite" },
      { id: "garnet-tsavorite", label: "Tsavorite" },
      { id: "garnet-almandine", label: "Garnet" },
      { id: "peridot", label: "Peridot" },
      { id: "topaz-blue", label: "Blue Topaz" },
      { id: "tourmaline", label: "Tourmaline" },
      { id: "aquamarine", label: "Aquamarine" },
      { id: "morganite", label: "Morganite" },
      { id: "amethyst", label: "Amethyst" },
      { id: "citrine", label: "Citrine" },
    ],
  },
  {
    title: "Specialty",
    tagline: "Iridescent & translucent",
    items: [
      { id: "opal", label: "Opal" },
      { id: "jade", label: "Jade" },
      { id: "pearl", label: "Pearl" },
    ],
  },
];

const ALL_ENTRIES: { entry: MaterialEntry; groupTitle: string }[] = MATERIAL_GROUPS.flatMap((g) =>
  g.items.map((entry) => ({ entry, groupTitle: g.title })),
);

const LIGHTING: { id: LightingPresetId; label: string; icon: typeof Sun }[] = [
  { id: "studio", label: "Studio", icon: Sun },
  { id: "soft", label: "Soft", icon: SunDim },
  { id: "dark", label: "Low key", icon: Moon },
];

const FINISHES: { id: FinishId; label: string; hint: string }[] = [
  { id: "polished", label: "Polished", hint: "Mirror" },
  { id: "satin", label: "Satin", hint: "Soft matte" },
  { id: "brushed", label: "Brushed", hint: "Directional grain" },
  { id: "sandblasted", label: "Sandblasted", hint: "Frosted" },
  { id: "hammered", label: "Hammered", hint: "Domed dimples" },
];

function prettyName(id: MaterialPresetId): string {
  if (id === "original") return "Original";
  const match = ALL_ENTRIES.find((x) => x.entry.id === id);
  if (!match) return id;
  return match.entry.label;
}

function groupOf(id: MaterialPresetId): string {
  if (id === "original") return "As uploaded";
  return ALL_ENTRIES.find((x) => x.entry.id === id)?.groupTitle ?? "";
}

function slotKind(slot: SlotId): "metal" | "gem" {
  return slot.startsWith("Gem") || slot.startsWith("Accent") ? "gem" : "metal";
}

function mapCatalogItemToPreset(item: GemoraCatalogItem, slot: SlotId): MaterialPresetId {
  return slotKind(slot) === "gem" ? mapGemoraGemToPreset(item) : mapGemoraMetalToPreset(item);
}

type StudioSidebarProps = {
  modelId: string;
  modelConfig?: PersistedModelConfig;
  onOpenAi: () => void;
  onOpenExport: () => void;
  onOpenHiResExport: () => void;
  onOpenVideo360: () => void;
  className?: string;
};

export function StudioSidebar({
  modelId,
  modelConfig = buildModelConfigFromSlots([]),
  onOpenAi,
  onOpenExport,
  onOpenHiResExport,
  onOpenVideo360,
  className,
}: StudioSidebarProps) {
  const preset = useMaterialPresetStore((s) => s.preset);
  const setPreset = useMaterialPresetStore((s) => s.setPreset);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const setSlotPreset = useMaterialPresetStore((s) => s.setSlotPreset);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const setLighting = useMaterialPresetStore((s) => s.setLighting);
  const finish = useMaterialPresetStore((s) => s.finish);
  const setFinish = useMaterialPresetStore((s) => s.setFinish);
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const setSceneSetting = useMaterialPresetStore((s) => s.setSceneSetting);
  const finishApplies = preset !== "original" && !isGemPresetId(preset);
  const autoRotate = useMaterialPresetStore((s) => s.autoRotate);
  const setAutoRotate = useMaterialPresetStore((s) => s.setAutoRotate);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeSlot, setActiveSlot] = useState<SlotId>("Metal 01");
  const [catalog, setCatalog] = useState<GemoraCatalogPayload | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetchGemoraCatalog()
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
  const slotIds = useMemo(() => {
    const configured = modelConfig.slots.map((slot) => slot.slotId);
    const fromSelections = Object.keys(slotSelections);
    const merged = Array.from(new Set([...configured, ...fromSelections]));
    return merged.length ? merged : ["Metal 01"];
  }, [modelConfig.slots, slotSelections]);
  const resolvedActiveSlot = slotIds.includes(activeSlot) ? activeSlot : (slotIds[0] ?? "Metal 01");
  const slotCatalogItems = useMemo(() => {
    if (!catalog) return [] as GemoraCatalogItem[];
    const source = slotKind(resolvedActiveSlot) === "gem" ? catalog.gems : catalog.metals;
    if (!trimmedQuery) return source;
    return source.filter((item) => item.name.toLowerCase().includes(trimmedQuery));
  }, [catalog, resolvedActiveSlot, trimmedQuery]);
  const slotOptionOverrides = useMemo(() => {
    const key = resolvedActiveSlot;
    return modelConfig.materialOptionsBySlot[key] ?? [];
  }, [modelConfig.materialOptionsBySlot, resolvedActiveSlot]);
  const envOptions = useMemo<Record<SceneSettingBucketKey, GemoraCatalogItem[]>>(() => {
    if (!catalog?.scenes) {
      return {
        "ENVIRONMENT-METAL": [],
        "ENVIRONMENT-GEM": [],
        GROUND: [],
        BACKGROUND: [],
        VJSON: [],
      } as Record<SceneSettingBucketKey, GemoraCatalogItem[]>;
    }
    const byBucket = (bucket: SceneSettingBucketKey): GemoraCatalogItem[] => {
      const token = bucket.toLowerCase().replace("-", " ");
      const filtered = catalog.scenes.filter((item) =>
        `${item.type} ${item.category} ${item.name}`.toLowerCase().includes(token),
      );
      return filtered.length ? filtered : catalog.scenes;
    };
    return Object.fromEntries(SCENE_BUCKET_ORDER.map((bucket) => [bucket, byBucket(bucket)])) as Record<
      SceneSettingBucketKey,
      GemoraCatalogItem[]
    >;
  }, [catalog]);

  async function handleCapture() {
    const dataUrl = captureFrameToDataUrl();
    if (!dataUrl) {
      setStatus("Canvas not ready");
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/render/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, material: preset, lighting, image: dataUrl }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; key?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setStatus(json.key ? `Saved · ${json.key}` : "Saved");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function downloadPng() {
    const dataUrl = captureFrameToDataUrl();
    if (!dataUrl) {
      setStatus("Canvas not ready");
      return;
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${modelId}-render.png`;
    a.click();
    setStatus("PNG downloaded");
  }

  async function downloadSourceModel() {
    try {
      const res = await fetch(`/api/models/source/${encodeURIComponent(modelId)}`, { cache: "no-store" });
      const json = (await res.json()) as { error?: string; url?: string; model_key?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Source model unavailable");
      }
      const a = document.createElement("a");
      a.href = json.url;
      a.download = (json.model_key?.split("/").pop() ?? `${modelId}.glb`).replace(/[^\w.\-]+/g, "_");
      a.rel = "noopener";
      a.click();
      setStatus("Source model download started");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Source download failed");
    }
  }

  const currentColor = getPresetSwatchColor(preset);
  const currentIsGem = isTransmissive(preset);

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      {/* Brand mark */}
      <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-border/60 px-5 pb-3 pt-4">
        <span className="font-display text-[15px] italic leading-none tracking-tight text-foreground">
          DevJewels
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          atelier
        </span>
      </div>

      {/* Now-showing card */}
      <NowShowingCard
        preset={preset}
        currentColor={currentColor}
        currentIsGem={currentIsGem}
        onRevert={() => setPreset("original")}
      />

      <Tabs defaultValue="materials" className="flex min-h-0 flex-1 flex-col">
        <TabsList
          variant="line"
          className="mx-5 h-auto justify-start gap-1 self-start bg-transparent p-0"
        >
          <TabsTrigger
            value="materials"
            className="rounded-none border-b-2 border-transparent px-1.5 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground"
          >
            Materials
          </TabsTrigger>
          <TabsTrigger
            value="scene"
            className="rounded-none border-b-2 border-transparent px-1.5 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground"
          >
            Scene
          </TabsTrigger>
          <TabsTrigger
            value="export"
            className="rounded-none border-b-2 border-transparent px-1.5 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground"
          >
            Export
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="materials"
          className="mt-0 flex min-h-0 flex-1 flex-col gap-0 overflow-hidden outline-none"
        >
          <div className="space-y-3 px-5 pt-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search materials"
                className="h-9 border-border/60 bg-muted/40 pl-8 pr-8 text-xs placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:bg-background"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
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
                  Gemora match
                </span>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                {slotIds.map((slot) => {
                  const active = activeSlot === slot;
                  const selectedPreset = slotSelections[slot];
                  const isSelectedGem = selectedPreset ? isTransmissive(selectedPreset) : slotKind(slot) === "gem";
                  const swatchColor = selectedPreset ? getPresetSwatchColor(selectedPreset) : "#6b7280";
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setActiveSlot(slot)}
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
                        onClick={() => setFinish(f.id)}
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
          </div>

          <div className="mt-4 flex-1 overflow-y-auto px-5 pb-5">
            {slotOptionOverrides.length > 0 ? (
              <div className="space-y-5">
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
                      const selected = slotSelections[resolvedActiveSlot] === option.id;
                      const diamond = slotKind(resolvedActiveSlot) === "gem";
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setSlotPreset(resolvedActiveSlot, option.id);
                            setPreset(option.id);
                          }}
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
              </div>
            ) : catalog ? (
              slotCatalogItems.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No source materials match &ldquo;{query}&rdquo;
                </p>
              ) : (
                <div className="space-y-5">
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
                        const selected = slotSelections[resolvedActiveSlot] === mappedPreset;
                        const diamond = slotKind(resolvedActiveSlot) === "gem";
                        return (
                          <button
                            key={item._id}
                            type="button"
                            onClick={() => {
                              setSlotPreset(resolvedActiveSlot, mappedPreset);
                              setPreset(mappedPreset);
                            }}
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
                </div>
              )
            ) : filteredGroups.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                No materials match &ldquo;{query}&rdquo;
              </p>
            ) : (
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
                          onClick={() => setPreset(item.id)}
                        />
                      ))}
                    </div>
                  </motion.section>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="scene"
          className="mt-0 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4 outline-none"
        >
          <section>
            <h3 className="mb-2.5 font-display text-[13px] italic leading-none text-foreground/95">
              Lighting
            </h3>
            <div className="grid grid-cols-3 gap-1.5">
              {LIGHTING.map((L) => {
                const Icon = L.icon;
                const active = lighting === L.id;
                return (
                  <button
                    key={L.id}
                    type="button"
                    onClick={() => setLighting(L.id)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-2xl border bg-card/60 px-2 py-3 text-center transition-colors",
                      "border-border/60",
                      active
                        ? "border-foreground/45 bg-card shadow-sm"
                        : "hover:border-foreground/25 hover:bg-card",
                    )}
                    aria-pressed={active}
                  >
                    <Icon
                      className={cn("size-4 transition-colors", active ? "text-foreground" : "text-muted-foreground")}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "text-[10.5px] font-medium leading-tight tracking-tight",
                        active ? "text-foreground" : "text-foreground/75",
                      )}
                    >
                      {L.label}
                    </span>
                  </button>
                );
              })}
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
                        onClick={() => setSceneSetting(bucket, null)}
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
                            onClick={() => setSceneSetting(bucket, item._id)}
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
            <h3 className="font-display text-[13px] italic leading-none text-foreground/95">
              Camera
            </h3>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
              <Label htmlFor="auto-rotate" className="cursor-pointer text-sm text-foreground">
                Auto-rotate
              </Label>
              <Switch id="auto-rotate" checked={autoRotate} onCheckedChange={setAutoRotate} />
            </div>
            <p className="text-[10.5px] leading-relaxed text-muted-foreground">
              Tip · Drag to orbit, scroll to zoom, or use the bottom-right toolbar for precise control.
            </p>
          </section>
        </TabsContent>

        <TabsContent
          value="export"
          className="mt-0 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4 outline-none"
        >
          <section className="space-y-2">
            <h3 className="font-display text-[13px] italic leading-none text-foreground/95">
              Capture
            </h3>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-3 border-border/60 bg-card/60"
              onClick={() => void handleCapture()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Camera className="size-4" aria-hidden />
              )}
              <span className="flex flex-col items-start leading-tight">
                <span className="text-sm">Save render</span>
                <span className="text-[10px] text-muted-foreground">
                  Pushes current frame to cloud
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-3 border-border/60 bg-card/60"
              onClick={downloadPng}
            >
              <Download className="size-4" aria-hidden />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-sm">Download PNG</span>
                <span className="text-[10px] text-muted-foreground">Current frame · viewport size</span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-3 border-border/60 bg-card/60"
              onClick={() => void downloadSourceModel()}
            >
              <Download className="size-4" aria-hidden />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-sm">Download source model</span>
                <span className="text-[10px] text-muted-foreground">Original uploaded GLB/3DM/STL</span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-3 border-border/60 bg-card/60"
              onClick={onOpenHiResExport}
            >
              <Download className="size-4" aria-hidden />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-sm">High-res PNG</span>
                <span className="text-[10px] text-muted-foreground">1080p · 4K · 8K offscreen</span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-3 border-border/60 bg-card/60"
              onClick={onOpenVideo360}
            >
              <Video className="size-4" aria-hidden />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-sm">360° turntable</span>
                <span className="text-[10px] text-muted-foreground">
                  MP4 via Mediabunny + WebCodecs
                </span>
              </span>
            </Button>
          </section>

          <section className="space-y-2">
            <h3 className="font-display text-[13px] italic leading-none text-foreground/95">
              Share & marketing
            </h3>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-3 border-border/60 bg-card/60"
              onClick={onOpenAi}
            >
              <Sparkles className="size-4 text-primary" aria-hidden />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-sm">AI background</span>
                <span className="text-[10px] text-muted-foreground">Lifestyle scene compositing</span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-3 border-border/60 bg-card/60"
              onClick={onOpenExport}
            >
              <Maximize2 className="size-4" aria-hidden />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-sm">Embed code</span>
                <span className="text-[10px] text-muted-foreground">iframe for PDPs & decks</span>
              </span>
            </Button>
          </section>
        </TabsContent>
      </Tabs>

      {status ? (
        <div className="shrink-0 border-t border-border/60 px-5 py-2.5">
          <p className="text-[10.5px] leading-snug text-muted-foreground" role="status">
            {status}
          </p>
        </div>
      ) : null}

      {/* Hidden dropdown carrying legacy menu items so any direct callers still work. */}
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "sr-only")}>
          Legacy export
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={downloadPng}>PNG (current frame)</DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenHiResExport}>PNG (high-res)</DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenVideo360}>360° video</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onOpenExport}>Embed code</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type NowShowingProps = {
  preset: MaterialPresetId;
  currentColor: string;
  currentIsGem: boolean;
  onRevert: () => void;
};

function NowShowingCard({ preset, currentColor, currentIsGem, onRevert }: NowShowingProps) {
  const name = prettyName(preset);
  const group = groupOf(preset);
  const isOriginal = preset === "original";

  return (
    <div className="shrink-0 px-5 pb-4 pt-4">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/50 px-4 py-3.5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full blur-3xl"
          style={{ backgroundColor: `${currentColor}45` }}
        />
        <div className="relative flex items-center gap-3">
          <div
            className={cn(
              "relative grid size-11 shrink-0 place-items-center",
              currentIsGem ? "rounded-lg rotate-45" : "rounded-full",
              "shadow-[inset_0_2px_4px_rgba(255,255,255,0.55),inset_0_-3px_8px_rgba(0,0,0,0.2)]",
            )}
            style={{
              backgroundColor: currentColor,
              boxShadow: `0 0 0 1px var(--background), 0 0 0 3px ${currentColor}, 0 6px 14px -6px ${currentColor}80, inset 0 2px 4px rgba(255,255,255,0.55), inset 0 -3px 8px rgba(0,0,0,0.2)`,
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[9.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Now showing
            </p>
            <p className="mt-0.5 font-display text-[17px] italic leading-tight tracking-tight text-foreground">
              {name}
            </p>
            <p className="text-[10.5px] text-muted-foreground">{group}</p>
          </div>
          <button
            type="button"
            onClick={onRevert}
            disabled={isOriginal}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full border transition-colors",
              "border-border/70 bg-background text-muted-foreground",
              "hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30",
            )}
            title={isOriginal ? "Already showing the original materials" : "Revert to original"}
            aria-label="Revert to original"
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
