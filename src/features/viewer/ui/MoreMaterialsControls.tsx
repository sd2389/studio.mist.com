"use client";

import { Search, X } from "lucide-react";
import { FinishPreview } from "@/components/ui/finish-preview";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SlotSelectionMap } from "@/lib/slot-materials/material-rules";
import type { SourceCatalogPayload } from "@/lib/source-catalog";
import type { FinishId } from "@/stores/material-preset-store";
import { FINISHES, type SlotId } from "@/features/viewer/ui/studio-material-groups";
import { SlotTargetGrid } from "@/features/viewer/ui/SlotTargetGrid";

export type MoreMaterialsControlsProps = {
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

export function MoreMaterialsControls({
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
        <SlotTargetGrid
          className="mb-2"
          slotIds={slotIds}
          slotAliasMap={slotAliasMap}
          resolvedActiveSlot={resolvedActiveSlot}
          safeSlotSelections={safeSlotSelections}
          onActiveSlotChange={onActiveSlotChange}
        />
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
