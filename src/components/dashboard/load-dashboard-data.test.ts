import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Scene, SceneListPage, SceneListParams } from "@/lib/api/scenes";

const fetchScenesServer = vi.fn<(params?: SceneListParams) => Promise<SceneListPage>>();

vi.mock("@/lib/api/server-fetch", () => ({
  fetchScenesServer: (params?: SceneListParams) => fetchScenesServer(params),
}));

const { loadDashboardData } = await import("./load-dashboard-data");

const scene = { id: 7, name: "Halo" } as Scene;

describe("loadDashboardData", () => {
  beforeEach(() => {
    fetchScenesServer.mockReset();
  });

  it("asks the API for the page the filters name", async () => {
    fetchScenesServer.mockResolvedValue({ items: [scene], total: 1, page: 1, limit: 20 });
    const filters = { q: "", category: "", page: 1, limit: 20 };

    const data = await loadDashboardData(filters);

    expect(fetchScenesServer).toHaveBeenCalledTimes(1);
    expect(fetchScenesServer).toHaveBeenCalledWith(filters);
    expect(data).toEqual({
      initialScenes: [scene],
      initialError: null,
      filterResult: { scenes: [scene], total: 1, page: 1, pageCount: 1, limit: 20 },
      allSceneCount: 1,
    });
  });

  it("passes a search and category through, and counts every scene with a one-row request", async () => {
    fetchScenesServer.mockImplementation(async (params) =>
      params?.q
        ? { items: [scene], total: 12, page: 2, limit: 10 }
        : { items: [scene], total: 340, page: 1, limit: 1 },
    );
    const filters = { q: "halo", category: "Ring", page: 2, limit: 10 };

    const data = await loadDashboardData(filters);

    expect(fetchScenesServer).toHaveBeenCalledWith(filters);
    expect(fetchScenesServer).toHaveBeenCalledWith({ limit: 1 });
    expect(data.filterResult).toMatchObject({ total: 12, page: 2, pageCount: 2, limit: 10 });
    expect(data.allSceneCount).toBe(340);
  });

  it("shows why the scenes could not load", async () => {
    fetchScenesServer.mockRejectedValue(new Error("Backend unavailable"));

    const data = await loadDashboardData({ q: "", category: "", page: 3, limit: 50 });

    expect(data.initialError).toBe("Backend unavailable");
    expect(data.filterResult).toEqual({ scenes: [], total: 0, page: 1, pageCount: 1, limit: 50 });
  });
});
