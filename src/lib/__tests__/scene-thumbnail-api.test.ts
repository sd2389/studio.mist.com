import { afterEach, describe, expect, it, vi } from "vitest";

const upstreamFetch = vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();

// The real relay and error reading; only the API is stubbed.
vi.mock("@/lib/auth/upstream", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/upstream")>()),
  upstreamFetch: (path: string, init?: RequestInit) => upstreamFetch(path, init),
}));

const { MAX_THUMBNAIL_BYTES, setSceneThumbnail } = await import("@/lib/api/scenes");
const thumbnailRoute = await import("@/app/api/scenes/[id]/thumbnail/route");

const SCENE = { id: 812, thumbnail_key: "customers/7/thumbnails/a-thumbnail.webp" };

function put(id: string, body: BodyInit, headers: Record<string, string> = { "Content-Type": "image/webp" }) {
  return thumbnailRoute.PUT(
    new Request(`http://localhost/api/scenes/${id}/thumbnail`, { method: "PUT", headers, body, duplex: "half" } as RequestInit),
    { params: Promise.resolve({ id }) },
  );
}

/** A body that arrives in chunks and says nothing of its length. */
function streamOf(bytes: number): ReadableStream<Uint8Array> {
  const chunk = new Uint8Array(256 * 1024);
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      sent += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
}

afterEach(() => {
  upstreamFetch.mockReset();
  vi.restoreAllMocks();
});

describe("setSceneThumbnail", () => {
  it("puts the image itself, under its own type, and answers the scene", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(SCENE));
    const image = new Blob(["webp"], { type: "image/webp" });

    expect(await setSceneThumbnail(812, image)).toEqual(SCENE);
    const [url, init] = fetch.mock.calls[0]!;
    expect([url, init?.method, init?.body]).toEqual(["/api/scenes/812/thumbnail", "PUT", image]);
    expect(new Headers(init?.headers).get("Content-Type")).toBe("image/webp");
  });

  it("fails with the API's reason and status", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({ error: "A thumbnail must be a PNG, JPEG or WebP image." }, { status: 415 }),
    );

    await expect(setSceneThumbnail(812, new Blob(["gif"]))).rejects.toMatchObject({
      message: "A thumbnail must be a PNG, JPEG or WebP image.",
      status: 415,
    });
  });
});

describe("PUT /api/scenes/[id]/thumbnail", () => {
  it("passes the bytes and their type on, and relays the scene", async () => {
    upstreamFetch.mockResolvedValue(Response.json(SCENE));

    const res = await put("812", new Uint8Array([0x52, 0x49, 0x46, 0x46]));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SCENE);
    const [path, init] = upstreamFetch.mock.calls[0]!;
    expect([path, init?.method]).toEqual(["/scenes/812/thumbnail", "PUT"]);
    expect(new Uint8Array(await new Response(init?.body).arrayBuffer())).toEqual(new Uint8Array([0x52, 0x49, 0x46, 0x46]));
    expect(new Headers(init?.headers).get("Content-Type")).toBe("image/webp");
  });

  it("relays the API's refusal as { error } with its status", async () => {
    upstreamFetch.mockResolvedValue(Response.json({ detail: "Scene not found" }, { status: 404 }));

    const res = await put("812", new Uint8Array([1, 2, 3]));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Scene not found" });
  });

  it("refuses an id that is not a database id before asking the API", async () => {
    const res = await put("7a", new Uint8Array([1]));

    expect(res.status).toBe(400);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("refuses more than 2 MB without passing it on, whether its length is declared or not", async () => {
    const declared = await put("812", new Uint8Array(1), {
      "Content-Type": "image/png",
      "Content-Length": String(MAX_THUMBNAIL_BYTES + 1),
    });
    const streamed = await put("812", streamOf(MAX_THUMBNAIL_BYTES + 1));

    expect([declared.status, streamed.status]).toEqual([413, 413]);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });
});
