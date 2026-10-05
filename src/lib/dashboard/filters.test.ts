import { describe, expect, it } from "vitest";
import type { Scene } from "@/lib/api/scenes";
import {
  buildDashboardQuery,
  DEFAULT_DASHBOARD_ROWS,
  parseDashboardSearchParams,
  toDashboardFilterResult,
} from "./filters";

describe("parseDashboardSearchParams", () => {
  it("reads the filters the API pages and searches by", () => {
    expect(parseDashboardSearchParams({ q: "  halo ", category: "Ring", page: "3", limit: "50" })).toEqual({
      q: "halo",
      category: "Ring",
      page: 3,
      limit: 50,
    });
  });

  it("falls back to the first page of the default size", () => {
    expect(parseDashboardSearchParams(undefined)).toEqual({
      q: "",
      category: "",
      page: 1,
      limit: DEFAULT_DASHBOARD_ROWS,
    });
    expect(parseDashboardSearchParams({ page: "-2", limit: "7" })).toMatchObject({ page: 1, limit: DEFAULT_DASHBOARD_ROWS });
  });

  it("keeps the filters within what GET /scenes takes", () => {
    const filters = parseDashboardSearchParams({ q: "x".repeat(500), category: "c".repeat(300), page: "999999999" });
    expect(filters.q).toHaveLength(200);
    expect(filters.category).toHaveLength(128);
    expect(filters.page).toBe(100_000);
  });

  it("takes the first of repeated parameters", () => {
    expect(parseDashboardSearchParams({ q: ["ring", "band"] }).q).toBe("ring");
  });
});

describe("toDashboardFilterResult", () => {
  const scene = { id: 1 } as Scene;

  it("shows the API's page and how many pages its total fills", () => {
    expect(toDashboardFilterResult({ items: [scene], total: 41, page: 5, limit: 10 })).toEqual({
      scenes: [scene],
      total: 41,
      page: 5,
      pageCount: 5,
      limit: 10,
    });
  });

  it("counts one page when nothing matches", () => {
    expect(toDashboardFilterResult({ items: [], total: 0, page: 1, limit: 10 }).pageCount).toBe(1);
  });
});

describe("buildDashboardQuery", () => {
  it("keeps only the filters that differ from the defaults", () => {
    const current = { q: "", category: "", page: 1, limit: DEFAULT_DASHBOARD_ROWS };
    expect(buildDashboardQuery(current, {})).toEqual({});
    expect(buildDashboardQuery(current, { q: "halo", page: 2, limit: 20 })).toEqual({
      q: "halo",
      page: "2",
      limit: "20",
    });
  });
});
