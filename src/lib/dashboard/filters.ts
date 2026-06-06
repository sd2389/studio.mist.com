import type { Scene } from "@/lib/api/scenes";

export const DASHBOARD_ROWS_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_DASHBOARD_ROWS = 10;

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
    q: (raw("q") ?? "").trim(),
    category: (raw("category") ?? "").trim(),
    page: parsePositiveInt(raw("page"), 1),
    limit,
  };
}

function sceneMatchesQuery(scene: Scene, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const haystacks = [
    scene.name,
    scene.sku,
    scene.note,
    scene.category,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  return haystacks.some((h) => h.includes(needle));
}

export function filterScenes(scenes: Scene[], filters: Pick<DashboardFilters, "q" | "category">): Scene[] {
  return scenes.filter((scene) => {
    if (filters.category && scene.category !== filters.category) return false;
    return sceneMatchesQuery(scene, filters.q);
  });
}

export function paginateScenes(
  scenes: Scene[],
  page: number,
  limit: number,
): { scenes: Scene[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(scenes.length / limit));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * limit;
  return {
    scenes: scenes.slice(start, start + limit),
    page: safePage,
    pageCount,
  };
}

export function applyDashboardFilters(
  allScenes: Scene[],
  filters: DashboardFilters,
): DashboardFilterResult {
  const filtered = filterScenes(allScenes, filters);
  const { scenes, page, pageCount } = paginateScenes(filtered, filters.page, filters.limit);
  return {
    scenes,
    total: filtered.length,
    page,
    pageCount,
    limit: filters.limit,
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
