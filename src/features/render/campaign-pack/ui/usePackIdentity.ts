"use client";

import { useEffect, useMemo, useState } from "react";
import { getScene, getSceneByViewerId } from "@/features/scene";
import type { PackIdentity } from "../domain/types";

type IdentityInput = {
  modelId: string;
  sku?: string | null;
  name?: string | null;
  /** Editor scenes load by id; the viewer resolves by viewer id. */
  sceneId?: number;
  enabled: boolean;
};

/** SKU/name for pack file names — props first, then a best-effort scene lookup. */
export function usePackIdentity({ modelId, sku, name, sceneId, enabled }: IdentityInput): PackIdentity {
  const [fetched, setFetched] = useState<{ sku: string | null; name: string | null } | null>(null);
  const needsLookup = enabled && !(name?.trim() && sku?.trim());

  useEffect(() => {
    if (!needsLookup) return;
    let cancelled = false;
    const request = sceneId ? getScene(sceneId) : getSceneByViewerId(modelId);
    request
      .then((scene) => {
        if (!cancelled) setFetched({ sku: scene.sku ?? null, name: scene.name ?? null });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [needsLookup, sceneId, modelId]);

  return useMemo(
    () => ({
      modelId,
      sku: sku?.trim() || fetched?.sku?.trim() || null,
      name: name?.trim() || fetched?.name?.trim() || null,
    }),
    [modelId, sku, name, fetched],
  );
}
