"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchBackgrounds,
  fetchEnvironments,
  fetchGems,
  fetchGrounds,
  fetchMetals,
  fetchScenePresets,
} from "@/lib/catalog/fetch-catalog";
import type { CatalogItem, CatalogPage } from "@/lib/catalog/types";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";

export type CatalogKind =
  | "metals"
  | "gems"
  | "environments"
  | "backgrounds"
  | "grounds"
  | "scene-presets";

type UseCatalogInfiniteScrollArgs<T extends CatalogItem> = {
  kind: CatalogKind;
  initialPage: CatalogPage<T> | null;
  pageSize?: number;
  envType?: string;
};

async function fetchCatalogPage(
  kind: CatalogKind,
  offset: number,
  pageSize: number,
  envType?: string,
): Promise<CatalogPage<CatalogItem>> {
  switch (kind) {
    case "metals":
      return fetchMetals({ limit: pageSize, offset });
    case "gems":
      return fetchGems({ limit: pageSize, offset });
    case "environments":
      return fetchEnvironments({ env_type: envType, limit: pageSize, offset });
    case "backgrounds":
      return fetchBackgrounds({ limit: pageSize, offset });
    case "grounds":
      return fetchGrounds({ limit: pageSize, offset });
    case "scene-presets":
      return fetchScenePresets({ limit: pageSize, offset });
  }
}

export function useCatalogInfiniteScroll<T extends CatalogItem>({
  kind,
  initialPage,
  pageSize = 48,
  envType,
}: UseCatalogInfiniteScrollArgs<T>) {
  const [items, setItems] = useState<T[]>(() => initialPage?.items ?? []);
  const [total, setTotal] = useState(() => initialPage?.total ?? 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialPage?.items ?? []);
    setTotal(initialPage?.total ?? 0);
    setError(null);
  }, [initialPage]);

  useEffect(() => {
    if (items.length === 0) return;
    const payload = items.map((item) => ({ slug: item.slug, params: item.params }));
    if (kind === "metals") {
      useCatalogParamsStore.getState().registerMetals(payload);
    } else if (kind === "gems") {
      useCatalogParamsStore.getState().registerGems(payload);
    }
  }, [items, kind]);

  const hasMore = items.length < total;

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchCatalogPage(kind, items.length, pageSize, envType);
      setItems((prev) => [...prev, ...(page.items as unknown as T[])]);
      setTotal(page.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load catalog");
    } finally {
      setLoadingMore(false);
    }
  }, [envType, hasMore, items.length, kind, loadingMore, pageSize]);

  const statusLabel = useMemo(() => {
    if (total === 0) return "No items loaded";
    return `${items.length} of ${total}`;
  }, [items.length, total]);

  return {
    items,
    total,
    hasMore,
    loadingMore,
    error,
    loadMore,
    statusLabel,
  };
}
