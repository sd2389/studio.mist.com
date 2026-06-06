"use client";

import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalogInfiniteScroll } from "@/features/editor/hooks/useCatalogInfiniteScroll";
import { useEditorSlotContext } from "@/features/editor/hooks/useEditorSlotContext";
import { useUserLibraryMaterials } from "@/features/editor/hooks/useUserLibraryMaterials";
import { mapCatalogMetalToApply } from "@/lib/catalog/map-to-preset";
import type { CatalogPage, MetalItem } from "@/lib/catalog/types";
import { customMaterialRef } from "@/lib/library/custom-material-ref";
import { deleteUserMaterialItem } from "@/features/editor/ui/UserMaterialGrid";
import type { LibraryPage, UserMaterialItem } from "@/lib/library/types";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { CatalogSwatchTile } from "./CatalogSwatchTile";
import { CustomMaterialDialog } from "./CustomMaterialDialog";
import { UserMaterialGrid } from "./UserMaterialGrid";

type EditorMetalMaterialTabProps = {
  activeSlot: string | null;
  modelConfig: PersistedModelConfig;
  initialMetals: CatalogPage<MetalItem> | null;
  initialUserMetals?: LibraryPage<UserMaterialItem> | null;
};

export function EditorMetalMaterialTab({
  activeSlot,
  modelConfig,
  initialMetals,
  initialUserMetals = null,
}: EditorMetalMaterialTabProps) {
  const [query, setQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);

  const {
    resolvedActiveSlot,
    selectedPresetForActiveSlot,
    activeSlotIsMetal,
    applyPresetToActiveSlots,
  } = useEditorSlotContext({ activeSlot, modelConfig });

  const { items, hasMore, loadingMore, error, loadMore, statusLabel } = useCatalogInfiniteScroll<MetalItem>({
    kind: "metals",
    initialPage: initialMetals,
  });

  const {
    items: userItems,
    error: userError,
    addMaterial,
    removeMaterial,
    statusLabel: userStatusLabel,
  } = useUserLibraryMaterials({ kind: "metal", initialPage: initialUserMetals });

  const trimmedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!trimmedQuery) return items;
    return items.filter((item) => item.label.toLowerCase().includes(trimmedQuery));
  }, [items, trimmedQuery]);

  const filteredUserItems = useMemo(() => {
    if (!trimmedQuery) return userItems;
    return userItems.filter((item) => item.label.toLowerCase().includes(trimmedQuery));
  }, [userItems, trimmedQuery]);

  const isSelected = (item: MetalItem) => {
    const mapped = mapCatalogMetalToApply(item);
    return selectedPresetForActiveSlot === mapped.preset;
  };

  const handleDeleteUserMaterial = async (item: UserMaterialItem) => {
    await deleteUserMaterialItem(item);
    removeMaterial(item.id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Metal material</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Apply metals and surfaces to the active layer from the Layers tab.
          </p>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search metals"
            className="h-9 border-border/60 bg-muted/40 pl-8 pr-8 text-xs"
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

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs"
          onClick={() => setCustomOpen(true)}
        >
          <Plus className="size-3.5" aria-hidden />
          Create custom metal material
        </Button>

        {resolvedActiveSlot ? (
          <p className="text-[11px] text-muted-foreground">
            Active layer: <span className="font-medium text-foreground">{resolvedActiveSlot}</span>
            {!activeSlotIsMetal ? " · select a metal layer to apply" : null}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">Select a layer in the Layers tab first.</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">
              Your metal materials
            </h3>
            <span className="text-[10px] text-muted-foreground">{userStatusLabel}</span>
          </div>
          {userError ? <p className="mb-3 text-xs text-destructive">{userError}</p> : null}
          <UserMaterialGrid
            items={filteredUserItems}
            selectedRef={
              typeof selectedPresetForActiveSlot === "string" ? selectedPresetForActiveSlot : null
            }
            onSelect={(item) => {
              if (!activeSlotIsMetal) return;
              const finish =
                typeof item.params.finish === "string"
                  ? (item.params.finish as "polished" | "brushed" | "satin" | "hammered" | "sandblasted")
                  : undefined;
              applyPresetToActiveSlots(customMaterialRef(item.id), finish);
            }}
            onDelete={(item) => void handleDeleteUserMaterial(item)}
          />
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">
              Metal catalog
            </h3>
            <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
          </div>

          {!activeSlotIsMetal && resolvedActiveSlot ? (
            <p className="mb-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {resolvedActiveSlot} is a gem layer. Switch to a metal layer or open Gem Material.
            </p>
          ) : null}

          {error ? <p className="mb-3 text-xs text-destructive">{error}</p> : null}

          {filteredItems.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {trimmedQuery ? `No metals match "${query}"` : "No metal materials available."}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {filteredItems.map((item) => {
                const mapped = mapCatalogMetalToApply(item);
                const selected = isSelected(item);
                return (
                  <CatalogSwatchTile
                    key={item.slug}
                    item={item}
                    selected={selected}
                    onClick={() => {
                      if (!activeSlotIsMetal) return;
                      applyPresetToActiveSlots(mapped.preset, mapped.finish);
                    }}
                  />
                );
              })}
            </div>
          )}

          {hasMore ? (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      <CustomMaterialDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        kind="metal"
        catalogItems={items}
        onApply={(preset, finish) => {
          if (!activeSlotIsMetal) return;
          applyPresetToActiveSlots(preset, finish);
        }}
        onApplyCustom={(ref, finish) => {
          if (!activeSlotIsMetal) return;
          applyPresetToActiveSlots(ref, finish);
        }}
        onSaved={addMaterial}
      />
    </div>
  );
}
