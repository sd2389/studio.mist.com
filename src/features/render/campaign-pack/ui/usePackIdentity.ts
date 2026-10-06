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

type LookedUp = { key: string; sku: string | null; name: string | null };

export type PackIdentityRead = {
  identity: PackIdentity;
  /**
   * The scene lookup hasn't answered yet. A pack started now would be named from the viewer id
   * and leave out the embed, though the scene has a SKU.
   */
  pending: boolean;
};

/** SKU/name for pack file names — props first, then a best-effort scene lookup. */
export function usePackIdentity({ modelId, sku, name, sceneId, enabled }: IdentityInput): PackIdentityRead {
  const [fetched, setFetched] = useState<LookedUp | null>(null);
  const needsLookup = enabled && !(name?.trim() && sku?.trim());
  const key = sceneId ? `scene:${sceneId}` : `viewer:${modelId}`;

  useEffect(() => {
    if (!needsLookup) return;
    let cancelled = false;
    const request = sceneId ? getScene(sceneId) : getSceneByViewerId(modelId);
    request
      .then((scene) => {
        if (!cancelled) setFetched({ key, sku: scene.sku ?? null, name: scene.name ?? null });
      })
      // A failed lookup still answers: the pack is named from the props and the viewer id.
      .catch(() => {
        if (!cancelled) setFetched({ key, sku: null, name: null });
      });
    return () => {
      cancelled = true;
    };
  }, [needsLookup, key, sceneId, modelId]);

  // Only this piece's answer counts; another scene's would name the pack wrongly.
  const answer = fetched?.key === key ? fetched : null;
  const identity = useMemo(
    () => ({
      modelId,
      sku: sku?.trim() || answer?.sku?.trim() || null,
      name: name?.trim() || answer?.name?.trim() || null,
    }),
    [modelId, sku, name, answer],
  );
  return { identity, pending: needsLookup && answer === null };
}
