"use client";

import { MaterialSwatch } from "@/components/ui/material-swatch";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import {
  MATERIAL_GROUPS,
  type MaterialEntry,
} from "@/features/viewer/ui/studio-material-groups";
import { useShopperMaterialApply } from "@/features/viewer/ui/useShopperMaterialApply";
import type { ShopperMaterialKind } from "@/features/viewer/domain/shopper-material-apply";

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

  return (
    <div
      className="shrink-0 border-t border-border bg-card"
      data-testid="embed-shopper-materials"
    >
      {SHOPPER_ROWS.map((row) => (
        <EmbedShopperKindRow
          key={row.kind}
          kind={row.kind}
          label={row.label}
          entries={materialEntriesForKind(row.kind)}
          selectedId={selectedFor(row.kind)}
          onSelect={(id) => applyKind(row.kind, id)}
        />
      ))}
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
  entries: MaterialEntry[];
  selectedId?: MaterialEntry["id"];
  onSelect: (id: MaterialEntry["id"]) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-b-0"
      role="group"
      aria-label={label}
      data-shopper-kind={kind}
    >
      <p className="w-14 shrink-0 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
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

function materialEntriesForKind(kind: ShopperMaterialKind): MaterialEntry[] {
  return MATERIAL_GROUPS.flatMap((group) =>
    group.items.filter((item) =>
      kind === "gem" ? isGemPresetId(item.id) : !isGemPresetId(item.id),
    ),
  );
}
