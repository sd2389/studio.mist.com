"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalogInfiniteScroll } from "@/features/editor/hooks/useCatalogInfiniteScroll";
import type { CatalogPage, GroundItem } from "@/lib/catalog/types";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { CatalogSwatchTile } from "./CatalogSwatchTile";

type EditorGroundTabProps = {
  initialGrounds: CatalogPage<GroundItem> | null;
};

export function EditorGroundTab({ initialGrounds }: EditorGroundTabProps) {
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const setSceneSetting = useMaterialPresetStore((s) => s.setSceneSetting);
  const [query, setQuery] = useState("");

  const selectedSlug = sceneSettings.GROUND;

  const { items, hasMore, loadingMore, error, loadMore, statusLabel } =
    useCatalogInfiniteScroll<GroundItem>({
      kind: "grounds",
      initialPage: initialGrounds,
    });

  const trimmedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!trimmedQuery) return items;
    return items.filter((item) => item.label.toLowerCase().includes(trimmedQuery));
  }, [items, trimmedQuery]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Ground</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Shadow and reflection presets beneath the model.
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
            placeholder="Search ground presets"
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {error ? <p className="mb-3 text-xs text-destructive">{error}</p> : null}

        {filteredItems.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {trimmedQuery ? `No ground presets match "${query}"` : "No ground presets available."}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {filteredItems.map((item) => (
              <CatalogSwatchTile
                key={item.slug}
                item={item}
                selected={selectedSlug === item.slug}
                onClick={() => setSceneSetting("GROUND", item.slug)}
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

        <p className="mt-4 text-center text-[10px] text-muted-foreground">{statusLabel}</p>
      </div>
    </div>
  );
}
