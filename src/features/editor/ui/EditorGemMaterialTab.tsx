"use client";

import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalogInfiniteScroll } from "@/features/editor/hooks/useCatalogInfiniteScroll";
import { useEditorSlotContext } from "@/features/editor/hooks/useEditorSlotContext";
import { useUserLibraryMaterials } from "@/features/editor/hooks/useUserLibraryMaterials";
import { mapCatalogGemToPreset } from "@/lib/catalog/map-to-preset";
import type { CatalogPage, GemItem } from "@/lib/catalog/types";
import { customMaterialRef } from "@/lib/library/custom-material-ref";
import { deleteUserMaterialItem } from "@/features/editor/ui/UserMaterialGrid";
import type { LibraryPage, UserMaterialItem } from "@/lib/library/types";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { CatalogSwatchTile } from "./CatalogSwatchTile";
import { CustomMaterialDialog } from "./CustomMaterialDialog";
import { UserMaterialGrid } from "./UserMaterialGrid";

type EditorGemMaterialTabProps = {
  activeSlot: string | null;
  modelConfig: PersistedModelConfig;
  initialGems: CatalogPage<GemItem> | null;
  initialUserGems?: LibraryPage<UserMaterialItem> | null;
};

export function EditorGemMaterialTab({
  activeSlot,
  modelConfig,
  initialGems,
  initialUserGems = null,
}: EditorGemMaterialTabProps) {
  const [query, setQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);

  const {
    resolvedActiveSlot,
    selectedPresetForActiveSlot,
    activeSlotIsGem,
    applyPresetToActiveSlots,
  } = useEditorSlotContext({ activeSlot, modelConfig });

  const { items, hasMore, loadingMore, error, loadMore, statusLabel } = useCatalogInfiniteScroll<GemItem>({
    kind: "gems",
    initialPage: initialGems,
  });

  const {
    items: userItems,
    error: userError,
    addMaterial,
    removeMaterial,
    statusLabel: userStatusLabel,
  } = useUserLibraryMaterials({ kind: "gem", initialPage: initialUserGems });

  const trimmedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!trimmedQuery) return items;
    return items.filter((item) => item.label.toLowerCase().includes(trimmedQuery));
  }, [items, trimmedQuery]);

  const filteredUserItems = useMemo(() => {
    if (!trimmedQuery) return userItems;
    return userItems.filter((item) => item.label.toLowerCase().includes(trimmedQuery));
  }, [userItems, trimmedQuery]);

  const isSelected = (item: GemItem) => selectedPresetForActiveSlot === mapCatalogGemToPreset(item);

  const handleDeleteUserMaterial = async (item: UserMaterialItem) => {
    await deleteUserMaterialItem(item);
    removeMaterial(item.id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Gem material</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Apply gem materials to the active gem or accent layer.
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
            placeholder="Search gems"
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
          Create custom gem material
        </Button>

        {resolvedActiveSlot ? (
          <p className="text-[11px] text-muted-foreground">
            Active layer: <span className="font-medium text-foreground">{resolvedActiveSlot}</span>
            {!activeSlotIsGem ? " · select a gem layer to apply" : null}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">Select a layer in the Layers tab first.</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">
              Your gem materials
            </h3>
            <span className="text-[10px] text-muted-foreground">{userStatusLabel}</span>
          </div>
          {userError ? <p className="mb-3 text-xs text-destructive">{userError}</p> : null}
          <UserMaterialGrid
            items={filteredUserItems}
            gemShape
            selectedRef={
              typeof selectedPresetForActiveSlot === "string" ? selectedPresetForActiveSlot : null
            }
            onSelect={(item) => {
              if (!activeSlotIsGem) return;
              applyPresetToActiveSlots(customMaterialRef(item.id));
            }}
            onDelete={(item) => void handleDeleteUserMaterial(item)}
          />
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">
              Gem catalog
            </h3>
            <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
          </div>

          {!activeSlotIsGem && resolvedActiveSlot ? (
            <p className="mb-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {resolvedActiveSlot} is a metal layer. Switch to a gem layer or open Metal Material.
            </p>
          ) : null}

          {error ? <p className="mb-3 text-xs text-destructive">{error}</p> : null}

          {filteredItems.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {trimmedQuery ? `No gems match "${query}"` : "No gem materials available."}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {filteredItems.map((item) => (
                <CatalogSwatchTile
                  key={item.slug}
                  item={item}
                  gemShape
                  selected={isSelected(item)}
                  onClick={() => {
                    if (!activeSlotIsGem) return;
                    applyPresetToActiveSlots(mapCatalogGemToPreset(item));
                  }}
                />
              ))}
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
        kind="gem"
        catalogItems={items}
        onApply={(preset) => {
          if (!activeSlotIsGem) return;
          applyPresetToActiveSlots(preset);
        }}
        onApplyCustom={(ref) => {
          if (!activeSlotIsGem) return;
          applyPresetToActiveSlots(ref);
        }}
        onSaved={addMaterial}
      />
    </div>
  );
}
