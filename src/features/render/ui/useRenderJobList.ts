"use client";

import { useEffect, useState } from "react";
import { listRenderJobs, onRenderJobsCreated, type RenderJob, type RenderJobFilter } from "../lib/render-jobs-api";

const PAGE_SIZE = 20;

/** One read of the list: the filter and refresh it answers, and what came back. */
type JobListRead = {
  filterKey: string;
  read: number;
  jobs: RenderJob[];
  nextBefore: number | null;
  error: string | null;
};

function listError(error: unknown): string {
  return error instanceof Error ? error.message : "Your exports couldn't be loaded";
}

/**
 * The caller's jobs that match `filter`, newest first, a page at a time; each job keeps
 * itself up to date (`useRenderJob`). The list is read again when the filter changes, when
 * this page creates jobs (a dialog's, which go on rendering once it closes) and on `refresh`,
 * which keep the jobs on show until the new read is in.
 */
export function useRenderJobList(filter: RenderJobFilter) {
  const filterKey = JSON.stringify(filter);
  const [read, setRead] = useState(0);
  const [list, setList] = useState<JobListRead | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => onRenderJobsCreated(() => setRead((count) => count + 1)), []);

  useEffect(() => {
    const controller = new AbortController();
    const query: RenderJobFilter = { ...(JSON.parse(filterKey) as RenderJobFilter), limit: PAGE_SIZE };
    listRenderJobs(query, { signal: controller.signal })
      .then((page) => setList({ filterKey, read, jobs: page.items, nextBefore: page.next_before, error: null }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // A refresh that failed keeps the jobs it would have replaced.
        setList((latest) => ({
          filterKey,
          read,
          jobs: latest?.filterKey === filterKey ? latest.jobs : [],
          nextBefore: latest?.filterKey === filterKey ? latest.nextBefore : null,
          error: listError(error),
        }));
      });
    return () => controller.abort();
  }, [filterKey, read]);

  const shown = list?.filterKey === filterKey ? list : null;
  const current = shown?.read === read ? shown : null;

  async function loadMore() {
    const page = current;
    const before = page?.nextBefore;
    if (!page || !before) return;
    setLoadingMore(true);
    try {
      const next = await listRenderJobs({ ...filter, limit: PAGE_SIZE, before });
      setList((latest) =>
        latest === page ? { ...page, jobs: [...page.jobs, ...next.items], nextBefore: next.next_before } : latest,
      );
    } catch (error) {
      setList((latest) => (latest === page ? { ...page, error: listError(error) } : latest));
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    jobs: shown?.jobs ?? [],
    loading: current === null,
    error: current?.error ?? null,
    hasMore: Boolean(current?.nextBefore),
    loadingMore,
    loadMore,
    refresh: () => setRead((count) => count + 1),
  };
}
