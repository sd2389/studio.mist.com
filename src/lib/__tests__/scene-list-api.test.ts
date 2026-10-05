import { afterEach, describe, expect, it, vi } from "vitest";

const upstreamFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();

vi.mock("@/lib/auth/upstream", () => ({
  upstreamFetch: (path: string, init?: RequestInit) => upstreamFetch(path, init),
  readUpstreamJson: async (res: Response) => res.json(),
  upstreamError: (_json: unknown, fallback: string) => fallback,
}));

const { listScenes, sceneListSearch, scenePageCount } = await import("@/lib/api/scenes");
const { GET } = await import("@/app/api/scenes/route");

const EMPTY_PAGE = { items: [], total: 0, page: 1, limit: 20 };

describe("sceneListSearch", () => {
  it("sends only the filters that are set", () => {
    expect(sceneListSearch({})).toBe("");
    expect(sceneListSearch({ q: "", category: "", page: 1 })).toBe("");
    expect(sceneListSearch({ q: "halo & co", category: "Ring", page: 3, limit: 50 })).toBe(
      "?q=halo+%26+co&category=Ring&page=3&limit=50",
    );
  });
});

describe("scenePageCount", () => {
  it("rounds up and never answers fewer than one page", () => {
    expect(scenePageCount({ total: 0, limit: 20 })).toBe(1);
    expect(scenePageCount({ total: 20, limit: 20 })).toBe(1);
    expect(scenePageCount({ total: 21, limit: 20 })).toBe(2);
  });
});

describe("listScenes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks the Next proxy for one page", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(EMPTY_PAGE), { status: 200 }));

    await expect(listScenes({ q: "halo", page: 2, limit: 20 })).resolves.toEqual(EMPTY_PAGE);

    expect(fetchSpy).toHaveBeenCalledWith("/api/scenes?q=halo&page=2&limit=20", expect.anything());
  });
});

describe("GET /api/scenes", () => {
  afterEach(() => {
    upstreamFetch.mockReset();
  });

  it("passes the list filters to the API and nothing else", async () => {
    upstreamFetch.mockResolvedValue(new Response(JSON.stringify(EMPTY_PAGE), { status: 200 }));

    const res = await GET(
      new Request("http://localhost/api/scenes?q=halo&category=Ring&page=2&limit=50&user_id=9&debug=1"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EMPTY_PAGE);
    expect(upstreamFetch).toHaveBeenCalledWith("/scenes?q=halo&category=Ring&page=2&limit=50", undefined);
  });

  it("asks for the first page when no filter is given", async () => {
    upstreamFetch.mockResolvedValue(new Response(JSON.stringify(EMPTY_PAGE), { status: 200 }));

    await GET(new Request("http://localhost/api/scenes"));

    expect(upstreamFetch).toHaveBeenCalledWith("/scenes", undefined);
  });

  it("answers with the API's status when it refuses the filters", async () => {
    upstreamFetch.mockResolvedValue(new Response(JSON.stringify({ detail: [] }), { status: 422 }));

    const res = await GET(new Request("http://localhost/api/scenes?limit=500"));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Failed to list scenes" });
  });
});
