import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchCurrentUser = vi.fn();
const upstreamFetch = vi.fn();
const authHeaders = vi.fn(async () => ({}));
const enforceApiRateLimit = vi.fn(async () => null);

vi.mock("@/lib/auth/server-session", () => ({
  fetchCurrentUser: () => fetchCurrentUser(),
  authHeaders: () => authHeaders(),
}));

vi.mock("@/lib/auth/upstream", () => ({
  upstreamFetch: (...args: [string, RequestInit?]) => upstreamFetch(...args),
  readUpstreamJson: async () => ({}),
  upstreamError: (_json: unknown, fallback: string) => fallback,
}));

vi.mock("@/lib/observability/api-rate-limit", () => ({
  enforceApiRateLimit: () => enforceApiRateLimit(),
}));

vi.mock("@/lib/api-url", () => ({
  getServerApiUrl: () => "http://backend.test",
}));

describe("unauthenticated upload write APIs", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchCurrentUser.mockReset();
    upstreamFetch.mockReset();
    authHeaders.mockClear();
    enforceApiRateLimit.mockClear();
    fetchCurrentUser.mockResolvedValue(null);
  });

  it("POST /api/upload/presign returns 401 and does not call upstream", async () => {
    const { POST } = await import("@/app/api/upload/presign/route");
    const res = await POST(
      new Request("http://localhost/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: "ring.glb", content_type: "model/gltf-binary" }),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Authentication required");
    expect(upstreamFetch).not.toHaveBeenCalled();
    expect(enforceApiRateLimit).not.toHaveBeenCalled();
  });

  it("POST /api/upload/register returns 401 and does not call upstream", async () => {
    const { POST } = await import("@/app/api/upload/register/route");
    const res = await POST(
      new Request("http://localhost/api/upload/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "models/ring.glb",
          name: "Ring",
          sku: "SKU-1",
        }),
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Authentication required");
    expect(upstreamFetch).not.toHaveBeenCalled();
    expect(enforceApiRateLimit).not.toHaveBeenCalled();
  });

  it("POST /api/models/upload returns 401 and does not call upstream fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const { POST } = await import("@/app/api/models/upload/route");
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array([1, 2, 3])], "ring.glb", { type: "model/gltf-binary" }));
    const res = await POST(
      new Request("http://localhost/api/models/upload", {
        method: "POST",
        body: fd,
      }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Authentication required");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(enforceApiRateLimit).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
