"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalogInfiniteScroll } from "@/features/editor/hooks/useCatalogInfiniteScroll";
import { environmentPreviewUrl } from "@/lib/catalog/scene-appearance";
import type { CatalogPage, EnvironmentItem } from "@/lib/catalog/types";
import { envIntensityPercent, envRotationDegrees } from "@/lib/viewer-scene";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { EditorSliderField } from "./EditorSliderField";
import { CatalogSwatchTile } from "./CatalogSwatchTile";

type EditorEnvironmentTabProps = {
  envType: "metal_env" | "gem_env";
  initialEnvironments: CatalogPage<EnvironmentItem> | null;
};

const BUCKET_BY_TYPE = {
  metal_env: "ENVIRONMENT-METAL" as const,
  gem_env: "ENVIRONMENT-GEM" as const,
};

export function EditorEnvironmentTab({ envType, initialEnvironments }: EditorEnvironmentTabProps) {
  const bucket = BUCKET_BY_TYPE[envType];
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const setSceneSetting = useMaterialPresetStore((s) => s.setSceneSetting);
  const setSceneAdvanced = useMaterialPresetStore((s) => s.setSceneAdvanced);

  const [query, setQuery] = useState("");
  const selectedSlug = sceneSettings[bucket];
  const advanced = sceneSettings.advanced;
  const envKind = envType === "metal_env" ? "metal" : "gem";

  const rotation = envRotationDegrees(advanced, envKind, 0);
  const intensity = envIntensityPercent(advanced, envKind, 100);

  const { items, hasMore, loadingMore, error, loadMore, statusLabel } =
    useCatalogInfiniteScroll<EnvironmentItem>({
      kind: "environments",
      initialPage: initialEnvironments,
      envType,
    });

  const trimmedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!trimmedQuery) return items;
    return items.filter((item) => item.label.toLowerCase().includes(trimmedQuery));
  }, [items, trimmedQuery]);

  const title = envType === "metal_env" ? "Metal environment" : "Gem environment";
  const description =
    envType === "metal_env"
      ? "HDR lighting for metal reflections. Adjust rotation and intensity below."
      : "Gem-fire environment maps for facet sparkle.";

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search environments"
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

        {envType === "metal_env" ? (
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Configuration
            </p>
            <EditorSliderField
              label="Rotation"
              value={rotation}
              min={0}
              max={360}
              step={1}
              suffix="deg"
              onChange={(value) =>
                setSceneAdvanced({ metalEnvRotation: value })
              }
            />
            <EditorSliderField
              label="Intensity"
              value={intensity}
              min={0}
              max={200}
              step={1}
              suffix="%"
              onChange={(value) =>
                setSceneAdvanced({ metalEnvIntensity: value })
              }
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {error ? <p className="mb-3 text-xs text-destructive">{error}</p> : null}

        {filteredItems.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {trimmedQuery ? `No environments match "${query}"` : "No environments available."}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {filteredItems.map((item) => {
              const preview = environmentPreviewUrl(item);
              const tileItem = preview ? { ...item, swatch_url: preview } : item;
              return (
                <CatalogSwatchTile
                  key={item.slug}
                  item={tileItem}
                  selected={selectedSlug === item.slug}
                  onClick={() => {
                    setSceneSetting(bucket, item.slug);
                    if (envType === "metal_env") {
                      setSceneAdvanced({
                        metalEnvRotation: item.default_rotation,
                        metalEnvIntensity: Math.round(item.default_intensity * 100),
                      });
                    } else {
                      setSceneAdvanced({
                        gemEnvIntensity: Math.round(item.default_intensity * 100),
                        gemEnvRotation: item.default_rotation,
                      });
                    }
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

        <p className="mt-4 text-center text-[10px] text-muted-foreground">{statusLabel}</p>
      </div>
    </div>
  );
}
