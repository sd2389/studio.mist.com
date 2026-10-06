import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A fresh copy of the module, which keeps the flag once it has read it. */
async function freshModule() {
  vi.resetModules();
  return import("./server-exports");
}

function flags(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("loadServerExports", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("reads the flag from the features proxy once a page, however many ask at once", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => flags({ flags: { server_exports: true } }));
    const { knownServerExports, loadServerExports } = await freshModule();

    expect(knownServerExports()).toBeNull();
    expect(await Promise.all([loadServerExports(), loadServerExports()])).toEqual([true, true]);
    expect(await loadServerExports()).toBe(true);
    expect(knownServerExports()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/features", expect.anything());
  });

  it("is off when the API leaves the flag out, as it starts", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => flags({ flags: { upload: true } }));
    const { loadServerExports } = await freshModule();

    expect(await loadServerExports()).toBe(false);
  });

  it("is off while the flags can't be read, and asks again next time", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () => flags({ error: "Backend unavailable" }, 503))
      .mockImplementationOnce(async () => {
        throw new TypeError("Failed to fetch");
      })
      .mockImplementation(async () => flags({ flags: { server_exports: true } }));
    const { knownServerExports, loadServerExports } = await freshModule();

    expect(await loadServerExports()).toBe(false);
    expect(await loadServerExports()).toBe(false);
    expect(knownServerExports()).toBeNull();
    expect(await loadServerExports()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
