"use client";

import { motion } from "framer-motion";
import { MaterialSwatch } from "@/components/ui/material-swatch";
import { cn } from "@/lib/utils";
import { getPresetSwatchColor } from "@/lib/material-swatch";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { resolvePresetForSlot, type SlotSelectionMap } from "@/lib/slot-materials/material-rules";
import type { SourceCatalogItem, SourceCatalogPayload } from "@/lib/source-catalog";
import type { MaterialPresetId } from "@/stores/material-preset-store";
import {
  mapCatalogItemToPreset,
  prettyName,
  slotKind,
  type MaterialGroup,
} from "@/features/viewer/ui/studio-material-groups";

export type MoreCatalogGridProps = {
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

export function MoreCatalogGrid({
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
            <h3 className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">
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
            <h3 className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">
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
              <h3 className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">
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
