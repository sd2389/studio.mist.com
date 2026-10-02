"use client";

import { useState, type ReactNode } from "react";
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
  type SlotId,
} from "@/features/viewer/ui/studio-material-groups";
import {
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
  /** Scene name, used to name exported files. */
  displayName?: string | null;
  modelConfig?: PersistedModelConfig;
  /** Content of the Edit tab; the tab only shows when this is set. */
  editPanel?: ReactNode;
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
  displayName = null,
  modelConfig = buildModelConfigFromSlots([]),
  editPanel,
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
    resolvedActiveSlot,
    activePhysicalSlots,
    selectedPresetForActiveSlot,
  } = useStudioSlotContext({ modelConfig, activeSlot, kind: panel === "metal" || panel === "gem" ? panel : undefined });


  const currentColor = resolveSelectionSwatchColor(selectedPresetForActiveSlot);
  const currentIsGem = resolveSelectionIsGem(selectedPresetForActiveSlot);

  const showNowShowing = chrome !== "sheet";
  const showTabs = chrome !== "sheet";
  const nowShowingClass = chrome === "responsive" ? "hidden md:block" : undefined;
  const tabsClass = chrome === "responsive" ? "hidden md:block" : undefined;

  return (
    <div className={cn("flex h-full flex-col overflow-hidden", className)}>
      {chrome === "desktop" || chrome === "responsive" ? (
        <p className="hidden shrink-0 px-4 pt-3 text-[11px] font-medium text-foreground/70 md:block">
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
            withEdit={Boolean(editPanel)}
            className="border-b border-foreground/10"
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
          displayName={displayName}
          modelConfig={modelConfig}
          onOpenAi={onOpenAi}
          onOpenExport={onOpenExport}
          onOpenHiResExport={onOpenHiResExport}
          onOpenVideo360={onOpenVideo360}
        />
      ) : null}
      {panel === "edit" ? editPanel : null}
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
    <div className="shrink-0 border-b border-foreground/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className="size-8 shrink-0 rounded-[2px] border border-foreground/10"
          style={{ backgroundColor: currentColor }}
          title={currentIsGem ? "Gem" : "Metal"}
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/40">
            Now showing
          </p>
          <p className="truncate text-[13px] font-medium text-foreground">{name}</p>
          <p className="truncate text-[10px] text-foreground/40">{group}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/35">
            {slotBadge}
          </span>
          <button
            type="button"
            onClick={onRevert}
            disabled={isOriginal}
            className={cn(
              "grid size-7 place-items-center rounded-md border border-foreground/10 text-foreground/45 transition-colors",
              "hover:border-foreground/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30",
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
