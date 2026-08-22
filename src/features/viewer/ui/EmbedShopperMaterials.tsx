"use client";

import { useState } from "react";
import { MaterialSwatch } from "@/components/ui/material-swatch";
import { cn } from "@/lib/utils";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import { useShopperMaterialApply } from "@/features/viewer/ui/useShopperMaterialApply";
import { useShortViewport } from "@/features/viewer/ui/useShortViewport";
import {
  shopperFallbackOptions,
  shopperMaterialOptions,
  type ShopperMaterialKind,
  type ShopperMaterialOption,
} from "@/features/viewer/domain/shopper-material-apply";

type EmbedShopperMaterialsProps = {
  modelConfig?: PersistedModelConfig;
};

const SHOPPER_ROWS: { kind: ShopperMaterialKind; label: string }[] = [
  { kind: "metal", label: "Metal" },
  { kind: "gem", label: "Gem" },
];

export function EmbedShopperMaterials({
  modelConfig = buildModelConfigFromSlots([]),
}: EmbedShopperMaterialsProps) {
  const { applyKind, selectedFor } = useShopperMaterialApply(modelConfig);
  const isShortViewport = useShortViewport();
  const [shortKind, setShortKind] = useState<ShopperMaterialKind>("metal");

  return (
    <div
      className="shrink-0 border-t border-black/10 bg-[#F4F2EE] pb-[max(8px,env(safe-area-inset-bottom))]"
      data-testid="embed-shopper-materials"
    >
      {isShortViewport ? (
        <>
          <div
            className="grid grid-cols-2 border-b border-black/10"
            role="tablist"
            aria-label="Metal or gem"
          >
            {SHOPPER_ROWS.map((row) => {
              const selected = shortKind === row.kind;
              return (
                <button
                  key={row.kind}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    "min-h-11 text-[11px] font-medium uppercase tracking-[0.14em]",
                    selected
                      ? "bg-[#212121] text-white"
                      : "text-black/45 hover:bg-black/[0.04] hover:text-black",
                  )}
                  onClick={() => setShortKind(row.kind)}
                >
                  {row.label}
                </button>
              );
            })}
          </div>
          <EmbedShopperKindRow
            kind={shortKind}
            label={shortKind === "gem" ? "Gem" : "Metal"}
            entries={shopperMaterialOptions(
              modelConfig,
              shortKind,
              shopperFallbackOptions(shortKind),
            )}
            selectedId={selectedFor(shortKind)}
            onSelect={(id) => applyKind(shortKind, id)}
          />
        </>
      ) : (
        SHOPPER_ROWS.map((row) => (
          <EmbedShopperKindRow
            key={row.kind}
            kind={row.kind}
            label={row.label}
            entries={shopperMaterialOptions(
              modelConfig,
              row.kind,
              shopperFallbackOptions(row.kind),
            )}
            selectedId={selectedFor(row.kind)}
            onSelect={(id) => applyKind(row.kind, id)}
          />
        ))
      )}
    </div>
  );
}

function EmbedShopperKindRow({
  kind,
  label,
  entries,
  selectedId,
  onSelect,
}: {
  kind: ShopperMaterialKind;
  label: string;
  entries: ShopperMaterialOption[];
  selectedId?: ShopperMaterialOption["id"];
  onSelect: (id: ShopperMaterialOption["id"]) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 border-b border-black/10 px-3 py-2 last:border-b-0"
      role="group"
      aria-label={label}
      data-shopper-kind={kind}
    >
      <p className="w-14 shrink-0 text-[11px] font-medium uppercase tracking-[0.14em] text-black/45">
        {label}
      </p>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5">
        {entries.map((entry) => (
          <MaterialSwatch
            key={entry.id}
            id={entry.id}
            label={entry.label}
            selected={selectedId === entry.id}
            onClick={() => onSelect(entry.id)}
            className="min-w-[4.5rem] shrink-0"
          />
        ))}
      </div>
    </div>
  );
}
