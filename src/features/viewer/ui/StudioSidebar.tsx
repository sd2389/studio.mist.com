"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { renderAtResolution } from "@/lib/offscreen-render";
import { getHiresRefs } from "@/stores/hires-export-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import { isCustomMaterialRef, parseCustomMaterialId } from "@/lib/library/custom-material-ref";
import type { MaterialPresetId } from "@/stores/material-preset-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { useUserLibraryStore } from "@/stores/user-library-store";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import { resolvePresetForSlot, sanitizeSlotSelections } from "@/lib/slot-materials/material-rules";
import {
  buildSlotBadge,
  groupOf,
  prettyName,
  resolveGroupedPreset,
  slotKind,
  type SlotId,
} from "@/features/viewer/ui/studio-material-groups";
import {
  buildSlotAliasMap,
  filterSlotsByKind,
  resolveSelectionIsGem,
  resolveSelectionSwatchColor,
  shouldCollapseGemSlots,
} from "@/features/viewer/ui/studio-selection-utils";
import {
  StudioPrimaryBar,
  type StudioPrimaryPanel,
} from "@/features/viewer/ui/StudioPrimaryBar";
import { MetalPickerPanel } from "@/features/viewer/ui/MetalPickerPanel";
import { GemPickerPanel } from "@/features/viewer/ui/GemPickerPanel";
import { LightPickerPanel } from "@/features/viewer/ui/LightPickerPanel";
import { ExportSharePanel } from "@/features/viewer/ui/ExportSharePanel";
import { StudioMoreDrawer } from "@/features/viewer/ui/StudioMoreDrawer";

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
  const [panel, setPanel] = useState<StudioPrimaryPanel>("metal");
  const [activeSlot, setActiveSlot] = useState<SlotId>("Metal 1");

  const preset = useMaterialPresetStore((s) => s.preset);
  const setPreset = useMaterialPresetStore((s) => s.setPreset);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const setSlotPreset = useMaterialPresetStore((s) => s.setSlotPreset);

  const collapseGemSlots = useMemo(() => shouldCollapseGemSlots(modelConfig), [modelConfig]);
  const slotAliasMap = useMemo(
    () => buildSlotAliasMap(modelConfig, slotSelections, collapseGemSlots),
    [modelConfig, slotSelections, collapseGemSlots],
  );
  const slotIds = useMemo(() => Object.keys(slotAliasMap), [slotAliasMap]);

  function handlePanelChange(next: StudioPrimaryPanel) {
    setPanel(next);
    if (next === "metal") {
      const metals = filterSlotsByKind(slotIds, "metal");
      if (metals.length && slotKind(activeSlot) !== "metal") setActiveSlot(metals[0]);
    } else if (next === "gem") {
      const gems = filterSlotsByKind(slotIds, "gem");
      if (gems.length && slotKind(activeSlot) !== "gem") setActiveSlot(gems[0]);
    }
  }

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

  const currentColor = resolveSelectionSwatchColor(selectedPresetForActiveSlot);
  const currentIsGem = resolveSelectionIsGem(selectedPresetForActiveSlot);

  async function downloadPng() {
    const refs = getHiresRefs();
    if (!refs) return;
    try {
      const { exposure, postfxConfig } = getRenderFidelity();
      const { width, height } = refs.gl.domElement;
      const blob = await renderAtResolution({
        gl: refs.gl,
        scene: refs.scene,
        camera: refs.camera,
        width,
        height,
        pixelRatio: 2,
        exposure,
        postfxConfig,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${modelId}-render.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Legacy menu path — ExportSharePanel surfaces status for the primary UI.
    }
  }

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-border/60 px-5 pb-3 pt-4">
        <span className="font-display text-[15px] italic leading-none tracking-tight text-foreground">
          DevJewels
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          atelier
        </span>
      </div>

      <NowShowingCard
        preset={selectedPresetForActiveSlot}
        currentColor={currentColor}
        currentIsGem={currentIsGem}
        activeSlot={resolvedActiveSlot}
        activeSlotCount={activePhysicalSlots.length}
        onRevert={() => {
          for (const slot of activePhysicalSlots) setSlotPreset(slot, "original");
          setPreset("original");
        }}
      />

      <StudioPrimaryBar active={panel} onChange={handlePanelChange} />

      {panel === "metal" ? (
        <MetalPickerPanel
          modelConfig={modelConfig}
          activeSlot={activeSlot}
          onActiveSlotChange={setActiveSlot}
        />
      ) : null}
      {panel === "gem" ? (
        <GemPickerPanel
          modelConfig={modelConfig}
          activeSlot={activeSlot}
          onActiveSlotChange={setActiveSlot}
        />
      ) : null}
      {panel === "light" ? <LightPickerPanel /> : null}
      {panel === "export" ? (
        <ExportSharePanel
          modelId={modelId}
          onOpenAi={onOpenAi}
          onOpenExport={onOpenExport}
          onOpenHiResExport={onOpenHiResExport}
          onOpenVideo360={onOpenVideo360}
        />
      ) : null}
      {panel === "more" ? (
        <StudioMoreDrawer
          modelConfig={modelConfig}
          activeSlot={activeSlot}
          onActiveSlotChange={setActiveSlot}
        />
      ) : null}

      {/* Hidden dropdown carrying legacy menu items so any direct callers still work. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "sr-only")}
        >
          Legacy export
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => void downloadPng()}>PNG (current frame)</DropdownMenuItem>
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
  preset?: SlotMaterialRef;
  currentColor: string;
  currentIsGem: boolean;
  activeSlot: string;
  activeSlotCount: number;
  onRevert: () => void;
};

function NowShowingCard({
  preset = "original",
  currentColor,
  currentIsGem,
  activeSlot,
  activeSlotCount,
  onRevert,
}: NowShowingProps) {
  const customItem =
    preset && isCustomMaterialRef(preset)
      ? useUserLibraryStore.getState().getMaterial(parseCustomMaterialId(preset) ?? -1)
      : undefined;
  const name = customItem?.label ?? prettyName(preset as MaterialPresetId);
  const group =
    customItem?.kind === "gem"
      ? "Custom gem"
      : customItem
        ? "Custom metal"
        : groupOf(preset as MaterialPresetId);
  const isOriginal = preset === "original";
  const slotBadge = buildSlotBadge(activeSlot, activeSlotCount);

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
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="rounded-full border border-foreground/20 bg-background/90 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-foreground/75">
              {slotBadge}
            </span>
            <button
              type="button"
              onClick={onRevert}
              disabled={isOriginal}
              className={cn(
                "grid size-8 place-items-center rounded-full border transition-colors",
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
    </div>
  );
}
