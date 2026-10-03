import "server-only";

import type { Scene } from "@/lib/api/scenes";
import { fetchScenesServer } from "@/lib/api/server-fetch";
import {
  DEFAULT_DASHBOARD_ROWS,
  toDashboardFilterResult,
  type DashboardFilterResult,
  type DashboardFilters,
} from "@/lib/dashboard/filters";

export type DashboardData = {
  initialScenes: Scene[];
  initialError: string | null;
  filterResult: DashboardFilterResult;
  allSceneCount: number;
};

const NO_FILTERS: DashboardFilters = { q: "", category: "", page: 1, limit: DEFAULT_DASHBOARD_ROWS };

/**
 * The page of scenes the dashboard's filters ask for, searched and paged by the API, and how
 * many scenes the user has in all (a second, one-row request only while a filter is on).
 */
export async function loadDashboardData(filters: DashboardFilters = NO_FILTERS): Promise<DashboardData> {
  try {
    const isFiltered = Boolean(filters.q || filters.category);
    const [page, everything] = await Promise.all([
      fetchScenesServer(filters),
      isFiltered ? fetchScenesServer({ limit: 1 }) : null,
    ]);
    const filterResult = toDashboardFilterResult(page);
    return {
      initialScenes: filterResult.scenes,
      initialError: null,
      filterResult,
      allSceneCount: (everything ?? page).total,
    };
  } catch (e) {
    return {
      initialScenes: [],
      initialError: e instanceof Error ? e.message : "Failed to load scenes",
      filterResult: { scenes: [], total: 0, page: 1, pageCount: 1, limit: filters.limit },
      allSceneCount: 0,
    };
  }
}
