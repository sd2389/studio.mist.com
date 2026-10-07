import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * API keys through the Next proxies (src/app/api/api-keys/): the signed-in user's session goes
 * upstream as upstreamFetch adds it; a new key's answer is never cached.
 */

const upstreamFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();

vi.mock("@/lib/auth/upstream", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/upstream")>()),
  upstreamFetch: (path: string, init?: RequestInit) => upstreamFetch(path, init),
}));

const keysRoute = await import("@/app/api/api-keys/route");
const keyRoute = await import("@/app/api/api-keys/[id]/route");
const { createApiKey, listApiKeys, revokeApiKey } = await import("./api-keys");

const BODY = { name: "ERP", scopes: ["batches:read"], expires_in_days: null };
const CREATED = {
  id: 7,
  name: "ERP",
  prefix: "k3x9q2ab",
  scopes: ["batches:read"],
  created_at: "2026-10-07T12:00:00Z",
  last_used_at: null,
  expires_at: null,
  revoked_at: null,
  secret: `mist_k3x9q2ab_${"a".repeat(43)}`,
};

function post(body: string): Request {
  return new Request("http://localhost/api/api-keys", { method: "POST", body });
}

function remove(id: string) {
  return keyRoute.DELETE(new Request(`http://localhost/api/api-keys/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

afterEach(() => {
  upstreamFetch.mockReset();
  vi.restoreAllMocks();
});

describe("the API keys proxy", () => {
  it("makes a key as the signed-in user and answers it uncached", async () => {
    upstreamFetch.mockResolvedValue(Response.json(CREATED, { status: 201 }));

    const res = await keysRoute.POST(post(JSON.stringify(BODY)));

    expect(upstreamFetch).toHaveBeenCalledWith("/api-keys", { method: "POST", body: JSON.stringify(BODY) });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual(CREATED);
  });

  it("passes the API's refusal on", async () => {
    upstreamFetch.mockResolvedValue(Response.json({ detail: "API keys come with the Studio plan" }, { status: 403 }));

    const res = await keysRoute.POST(post(JSON.stringify(BODY)));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "API keys come with the Studio plan" });
  });

  it("sends nothing on for a body that isn't JSON", async () => {
    const res = await keysRoute.POST(post("name=ERP"));

    expect(res.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("lists the user's keys", async () => {
    upstreamFetch.mockResolvedValue(Response.json({ items: [], max_active: 10 }));

    const res = await keysRoute.GET();

    expect(upstreamFetch).toHaveBeenCalledWith("/api-keys", undefined);
    expect(await res.json()).toEqual({ items: [], max_active: 10 });
  });

  it("revokes a key by id, and refuses an id that isn't one", async () => {
    upstreamFetch.mockResolvedValue(Response.json({ detail: "API key not found" }, { status: 404 }));

    for (const id of ["abc", "0", "1e3", "../auth/me"]) {
      expect((await remove(id)).status).toBe(400);
    }
    expect(upstreamFetch).not.toHaveBeenCalled();

    const res = await remove("7");
    expect(upstreamFetch).toHaveBeenCalledWith("/api-keys/7", { method: "DELETE" });
    expect([res.status, await res.json()]).toEqual([404, { error: "API key not found" }]);
  });
});

describe("the API keys client", () => {
  it("calls the proxies", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json(CREATED, { status: 201 }));

    await createApiKey({ name: "ERP", scopes: ["batches:read"], expires_in_days: 30 });
    await listApiKeys();
    await revokeApiKey(7);

    const calls = fetch.mock.calls.map(([url, init]) => [url, init?.method, init?.body ?? null]);
    expect(calls).toEqual([
      ["/api/api-keys", "POST", JSON.stringify({ name: "ERP", scopes: ["batches:read"], expires_in_days: 30 })],
      ["/api/api-keys", "GET", null],
      ["/api/api-keys/7", "DELETE", null],
    ]);
  });
});
