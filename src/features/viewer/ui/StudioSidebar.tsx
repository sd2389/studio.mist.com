"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import { isCustomMaterialRef, parseCustomMaterialId } from "@/lib/library/custom-material-ref";
import type { MaterialPresetId } from "@/stores/material-preset-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { useUserLibraryStore } from "@/stores/user-library-store";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import {
  buildSlotBadge,
  groupOf,
  prettyName,
  slotKind,
  type SlotId,
} from "@/features/viewer/ui/studio-material-groups";
import {
  filterSlotsByKind,
  resolveSelectionIsGem,
  resolveSelectionSwatchColor,
} from "@/features/viewer/ui/studio-selection-utils";
import { useStudioSlotContext } from "@/features/viewer/ui/useStudioSlotContext";
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
  sku?: string | null;
  modelConfig?: PersistedModelConfig;
  panel?: StudioPrimaryPanel;
  onPanelChange?: (panel: StudioPrimaryPanel) => void;
  onOpenAi: () => void;
  onOpenExport: () => void;
  onOpenHiResExport: () => void;
  onOpenVideo360: () => void;
  chrome?: "desktop" | "sheet" | "responsive";
  className?: string;
};

export function StudioSidebar({
  modelId,
  sku,
  modelConfig = buildModelConfigFromSlots([]),
  panel: panelProp,
  onPanelChange,
  onOpenAi,
  onOpenExport,
  onOpenHiResExport,
  onOpenVideo360,
  chrome = "desktop",
  className,
}: StudioSidebarProps) {
  const [internalPanel, setInternalPanel] = useState<StudioPrimaryPanel>("metal");
  const panel = panelProp ?? internalPanel;
  const [activeSlot, setActiveSlot] = useState<SlotId>("Metal 1");

  function handlePanelChange(next: StudioPrimaryPanel) {
    if (panelProp === undefined) setInternalPanel(next);
    onPanelChange?.(next);
  }

  const setPreset = useMaterialPresetStore((s) => s.setPreset);
  const setSlotPreset = useMaterialPresetStore((s) => s.setSlotPreset);

  const {
    allSlotIds,
    resolvedActiveSlot,
    activePhysicalSlots,
    selectedPresetForActiveSlot,
  } = useStudioSlotContext({ modelConfig, activeSlot });

  useEffect(() => {
    if (panel === "metal") {
      const metals = filterSlotsByKind(allSlotIds, "metal");
      if (metals.length && slotKind(activeSlot) !== "metal") setActiveSlot(metals[0]);
    } else if (panel === "gem") {
      const gems = filterSlotsByKind(allSlotIds, "gem");
      if (gems.length && slotKind(activeSlot) !== "gem") setActiveSlot(gems[0]);
    }
  }, [activeSlot, allSlotIds, panel]);

  const currentColor = resolveSelectionSwatchColor(selectedPresetForActiveSlot);
  const currentIsGem = resolveSelectionIsGem(selectedPresetForActiveSlot);

  const showNowShowing = chrome !== "sheet";
  const showTabs = chrome !== "sheet";
  const nowShowingClass = chrome === "responsive" ? "hidden md:block" : undefined;
  const tabsClass = chrome === "responsive" ? "hidden md:block" : undefined;

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      {chrome === "desktop" || chrome === "responsive" ? (
        <p className="hidden shrink-0 px-4 pt-3 text-[11px] font-medium text-black/70 md:block">
          Studio
        </p>
      ) : null}

      {showNowShowing ? (
        <div className={nowShowingClass}>
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
        </div>
      ) : null}

      {showTabs ? (
        <div className={tabsClass}>
          <StudioPrimaryBar
            active={panel}
            onChange={handlePanelChange}
            layout="tabs"
            className="border-b border-black/10"
          />
        </div>
      ) : null}

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
          sku={sku}
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
    <div className="shrink-0 border-b border-black/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className="size-8 shrink-0 rounded-[2px] border border-black/10"
          style={{ backgroundColor: currentColor }}
          title={currentIsGem ? "Gem" : "Metal"}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-black/40">
            Now showing
          </p>
          <p className="truncate text-[13px] font-medium text-black">{name}</p>
          <p className="truncate text-[10px] text-black/40">{group}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-black/35">
            {slotBadge}
          </span>
          <button
            type="button"
            onClick={onRevert}
            disabled={isOriginal}
            className={cn(
              "grid size-7 place-items-center rounded-md border border-black/10 text-black/45 transition-colors",
              "hover:border-black/25 hover:text-black disabled:cursor-not-allowed disabled:opacity-30",
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
