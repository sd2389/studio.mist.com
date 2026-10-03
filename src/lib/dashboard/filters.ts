import {
  SCENE_SEARCH_MAX_LENGTH,
  scenePageCount,
  type Scene,
  type SceneListPage,
} from "@/lib/api/scenes";

export const DASHBOARD_ROWS_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_DASHBOARD_ROWS = 10;
/** The longest category and the highest page `GET /scenes` takes. */
const CATEGORY_MAX_LENGTH = 128;
const PAGE_MAX = 100_000;

export type DashboardFilters = {
  q: string;
  category: string;
  page: number;
  limit: number;
};

export type DashboardFilterResult = {
  scenes: Scene[];
  total: number;
  page: number;
  pageCount: number;
  limit: number;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parseDashboardSearchParams(
  params: Record<string, string | string[] | undefined> | undefined,
): DashboardFilters {
  const raw = (key: string) => {
    const v = params?.[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const limitRaw = parsePositiveInt(raw("limit"), DEFAULT_DASHBOARD_ROWS);
  const limit = (DASHBOARD_ROWS_OPTIONS as readonly number[]).includes(limitRaw)
    ? limitRaw
    : DEFAULT_DASHBOARD_ROWS;

  return {
    q: (raw("q") ?? "").trim().slice(0, SCENE_SEARCH_MAX_LENGTH),
    category: (raw("category") ?? "").trim().slice(0, CATEGORY_MAX_LENGTH),
    page: Math.min(parsePositiveInt(raw("page"), 1), PAGE_MAX),
    limit,
  };
}

/** The dashboard's view of a page of scenes from the API. */
export function toDashboardFilterResult(page: SceneListPage): DashboardFilterResult {
  return {
    scenes: page.items,
    total: page.total,
    page: page.page,
    pageCount: scenePageCount(page),
    limit: page.limit,
  };
}

export function buildDashboardQuery(
  current: DashboardFilters,
  patch: Partial<DashboardFilters>,
): Record<string, string> {
  const next: DashboardFilters = { ...current, ...patch };
  const params: Record<string, string> = {};
  if (next.q) params.q = next.q;
  if (next.category) params.category = next.category;
  if (next.page > 1) params.page = String(next.page);
  if (next.limit !== DEFAULT_DASHBOARD_ROWS) params.limit = String(next.limit);
  return params;
}
