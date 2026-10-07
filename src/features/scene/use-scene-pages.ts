"use client";

import { useEffect, useState } from "react";
import { listScenes, type SceneListPage } from "@/lib/api/scenes";

export type SceneQuery = { q: string; page: number };

/** The answer to one query: a page of scenes, or why it failed. */
export type ScenePageResult = { query: SceneQuery; page?: SceneListPage; error?: string };

/**
 * Pages of the signed-in user's scenes, `limit` a page, searched by the API (name, SKU, note and
 * category) 300 ms after the search stops changing; each page is fetched when its query changes.
 */
export function useScenePages(limit: number) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<SceneQuery>({ q: "", page: 1 });
  const [result, setResult] = useState<ScenePageResult | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const q = search.trim();
      setQuery((current) => (current.q === q ? current : { q, page: 1 }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let mounted = true;
    void listScenes({ q: query.q, page: query.page, limit })
      .then((page) => {
        if (mounted) setResult({ query, page });
      })
      .catch((err) => {
        if (mounted) setResult({ query, error: err instanceof Error ? err.message : "Failed to load models" });
      });
    return () => {
      mounted = false;
    };
  }, [query, limit]);

  const showPage = (page: number) => setQuery((current) => ({ ...current, page }));
  return { search, setSearch, query, result, loading: result?.query !== query, showPage };
}
