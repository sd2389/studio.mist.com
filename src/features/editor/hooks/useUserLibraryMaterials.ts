"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchUserMaterials } from "@/lib/library/fetch-library";
import type { LibraryPage, UserMaterialItem } from "@/lib/library/types";
import { useUserLibraryStore } from "@/stores/user-library-store";

type UseUserLibraryMaterialsArgs = {
  kind: "metal" | "gem";
  initialPage: LibraryPage<UserMaterialItem> | null;
  pageSize?: number;
};

export function useUserLibraryMaterials({
  kind,
  initialPage,
  pageSize = 48,
}: UseUserLibraryMaterialsArgs) {
  const hydrateMaterials = useUserLibraryStore((s) => s.hydrateMaterials);
  const upsertMaterial = useUserLibraryStore((s) => s.upsertMaterial);
  const removeMaterialFromStore = useUserLibraryStore((s) => s.removeMaterial);

  const [items, setItems] = useState<UserMaterialItem[]>(() => initialPage?.items ?? []);
  const [total, setTotal] = useState(() => initialPage?.total ?? 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pageItems = initialPage?.items ?? [];
    setItems(pageItems);
    setTotal(initialPage?.total ?? 0);
    setError(null);
    if (pageItems.length > 0) hydrateMaterials(pageItems);
  }, [hydrateMaterials, initialPage]);

  const hasMore = items.length < total;

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchUserMaterials({ kind, limit: pageSize, offset: items.length });
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
      hydrateMaterials([...items, ...page.items]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load library");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, hydrateMaterials, items, kind, loadingMore, pageSize]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const page = await fetchUserMaterials({ kind, limit: pageSize, offset: 0 });
      setItems(page.items);
      setTotal(page.total);
      hydrateMaterials(page.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to refresh library");
    }
  }, [hydrateMaterials, kind, pageSize]);

  const removeMaterial = useCallback(
    async (id: number) => {
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      removeMaterialFromStore(id);
    },
    [removeMaterialFromStore],
  );

  const addMaterial = useCallback(
    (item: UserMaterialItem) => {
      setItems((prev) => [item, ...prev]);
      setTotal((prev) => prev + 1);
      upsertMaterial(item);
    },
    [upsertMaterial],
  );

  const statusLabel = useMemo(() => {
    if (total === 0) return "No saved materials";
    return `${items.length} of ${total}`;
  }, [items.length, total]);

  return {
    items,
    total,
    hasMore,
    loadingMore,
    error,
    loadMore,
    refresh,
    removeMaterial,
    addMaterial,
    statusLabel,
  };
}
