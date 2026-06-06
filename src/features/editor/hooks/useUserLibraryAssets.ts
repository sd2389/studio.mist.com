"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchUserAssets } from "@/lib/library/fetch-library";
import type { LibraryPage, UserAssetItem } from "@/lib/library/types";

type UseUserLibraryAssetsArgs = {
  assetType: "background" | "metal_env" | "gem_env";
  initialPage: LibraryPage<UserAssetItem> | null;
  pageSize?: number;
};

export function useUserLibraryAssets({
  assetType,
  initialPage,
  pageSize = 48,
}: UseUserLibraryAssetsArgs) {
  const [items, setItems] = useState<UserAssetItem[]>(() => initialPage?.items ?? []);
  const [total, setTotal] = useState(() => initialPage?.total ?? 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialPage?.items ?? []);
    setTotal(initialPage?.total ?? 0);
    setError(null);
  }, [initialPage]);

  const hasMore = items.length < total;

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchUserAssets({
        asset_type: assetType,
        limit: pageSize,
        offset: items.length,
      });
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load assets");
    } finally {
      setLoadingMore(false);
    }
  }, [assetType, hasMore, items.length, loadingMore, pageSize]);

  const addAsset = useCallback((item: UserAssetItem) => {
    setItems((prev) => [item, ...prev]);
    setTotal((prev) => prev + 1);
  }, []);

  const removeAsset = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
  }, []);

  const statusLabel = useMemo(() => {
    if (total === 0) return "No saved assets";
    return `${items.length} of ${total}`;
  }, [items.length, total]);

  return {
    items,
    total,
    hasMore,
    loadingMore,
    error,
    loadMore,
    addAsset,
    removeAsset,
    statusLabel,
  };
}
