"use client";

import { ImagePlus, Search, Trash2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalogInfiniteScroll } from "@/features/editor/hooks/useCatalogInfiniteScroll";
import { useUserLibraryAssets } from "@/features/editor/hooks/useUserLibraryAssets";
import type { BackgroundItem, CatalogPage } from "@/lib/catalog/types";
import { deleteUserAsset, uploadUserAsset } from "@/lib/library/fetch-library";
import type { LibraryPage, UserAssetItem } from "@/lib/library/types";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { CatalogSwatchTile } from "./CatalogSwatchTile";

type EditorBackgroundTabProps = {
  initialBackgrounds: CatalogPage<BackgroundItem> | null;
  initialUserBackgrounds?: LibraryPage<UserAssetItem> | null;
};

const MAX_CUSTOM_BG_BYTES = 4 * 1024 * 1024;

export function EditorBackgroundTab({
  initialBackgrounds,
  initialUserBackgrounds = null,
}: EditorBackgroundTabProps) {
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const setSceneSetting = useMaterialPresetStore((s) => s.setSceneSetting);
  const setCustomBackground = useMaterialPresetStore((s) => s.setCustomBackground);

  const [query, setQuery] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedSlug = sceneSettings.BACKGROUND;
  const customBackground = sceneSettings.customBackground;

  const { items, hasMore, loadingMore, error, loadMore, statusLabel } =
    useCatalogInfiniteScroll<BackgroundItem>({
      kind: "backgrounds",
      initialPage: initialBackgrounds,
    });

  const {
    items: userAssets,
    error: userAssetsError,
    addAsset,
    removeAsset,
    statusLabel: userAssetsStatusLabel,
  } = useUserLibraryAssets({ assetType: "background", initialPage: initialUserBackgrounds });

  const trimmedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!trimmedQuery) return items;
    return items.filter((item) => item.label.toLowerCase().includes(trimmedQuery));
  }, [items, trimmedQuery]);

  const filteredUserAssets = useMemo(() => {
    if (!trimmedQuery) return userAssets;
    return userAssets.filter((item) => item.label.toLowerCase().includes(trimmedQuery));
  }, [userAssets, trimmedQuery]);

  const applyUserAsset = (asset: UserAssetItem) => {
    const url = asset.preview_url ?? asset.url;
    if (!url) return;
    setCustomBackground(url);
    setSceneSetting("BACKGROUND", null);
  };

  const handleUpload = async (file: File) => {
    setUploadError(null);
    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose a PNG or JPEG image.");
      return;
    }
    if (file.size > MAX_CUSTOM_BG_BYTES) {
      setUploadError("Image must be 4 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const asset = await uploadUserAsset(file, "background", file.name);
      addAsset(asset);
      applyUserAsset(asset);
    } catch (uploadErr) {
      setUploadError(uploadErr instanceof Error ? uploadErr.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAsset = async (asset: UserAssetItem) => {
    await deleteUserAsset(asset.id);
    removeAsset(asset.id);
    const url = asset.preview_url ?? asset.url;
    if (url && customBackground === url) {
      setCustomBackground(null);
    }
  };

  const isUserAssetSelected = (asset: UserAssetItem) => {
    const url = asset.preview_url ?? asset.url;
    return Boolean(url && customBackground === url);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Background</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload a custom image to your library or pick None, solids, and gradients.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleUpload(file);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2 text-xs"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="size-3.5" aria-hidden />
          {uploading ? "Uploading…" : "Upload custom background"}
        </Button>

        {customBackground ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={customBackground} alt="" className="size-10 rounded object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">Custom image</p>
              <button
                type="button"
                className="text-[10px] text-muted-foreground underline hover:text-foreground"
                onClick={() => setCustomBackground(null)}
              >
                Remove
              </button>
            </div>
          </div>
        ) : null}

        {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search backgrounds"
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
        <section className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">
              Your backgrounds
            </h3>
            <span className="text-[10px] text-muted-foreground">{userAssetsStatusLabel}</span>
          </div>
          {userAssetsError ? <p className="mb-3 text-xs text-destructive">{userAssetsError}</p> : null}
          {filteredUserAssets.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
              Uploaded backgrounds are saved to your library and reusable across models.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {filteredUserAssets.map((asset) => {
                const preview = asset.preview_url ?? asset.url;
                const selected = isUserAssetSelected(asset);
                return (
                  <div key={asset.id} className="relative">
                    <button
                      type="button"
                      onClick={() => applyUserAsset(asset)}
                      className={`group flex w-full flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2 text-center transition-colors ${
                        selected
                          ? "border-foreground/45 bg-card shadow-sm"
                          : "border-border/60 bg-card/50 hover:border-foreground/30 hover:bg-card"
                      }`}
                      title={asset.label}
                    >
                      <span
                        className={`relative size-10 overflow-hidden rounded-md ${
                          selected ? "ring-2 ring-foreground/40 ring-offset-2 ring-offset-card" : ""
                        }`}
                      >
                        {preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={preview} alt="" className="size-full object-cover" loading="lazy" />
                        ) : (
                          <span className="grid size-full place-items-center bg-muted text-[10px] text-muted-foreground">
                            ?
                          </span>
                        )}
                      </span>
                      <span className="line-clamp-2 max-w-full text-[10px] font-medium leading-tight text-foreground/75">
                        {asset.label}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="absolute right-0 top-0 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-destructive"
                      aria-label={`Delete ${asset.label}`}
                      onClick={() => void handleDeleteAsset(asset)}
                    >
                      <Trash2 className="size-2.5" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/80">
              Background catalog
            </h3>
            <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
          </div>

          {error ? <p className="mb-3 text-xs text-destructive">{error}</p> : null}

          {filteredItems.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {trimmedQuery ? `No backgrounds match "${query}"` : "No backgrounds available."}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {filteredItems.map((item) => (
                <CatalogSwatchTile
                  key={item.slug}
                  item={item}
                  selected={!customBackground && selectedSlug === item.slug}
                  onClick={() => {
                    setCustomBackground(null);
                    setSceneSetting("BACKGROUND", item.slug);
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
    </div>
  );
}
