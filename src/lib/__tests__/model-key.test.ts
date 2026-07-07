import { describe, expect, it } from "vitest";
import { modelExtFromUrl, viewerIdFromModelKey } from "@/lib/model-key";

describe("modelExtFromUrl", () => {
  it("matches plain storage keys", () => {
    expect(modelExtFromUrl("models/ring.glb")).toBe("glb");
    expect(modelExtFromUrl("customers/1/models/ring.gltf")).toBe("gltf");
    expect(modelExtFromUrl("ring.stl")).toBe("stl");
    expect(modelExtFromUrl("ring.3dm")).toBe("3dm");
  });

  it("is case-insensitive on the extension", () => {
    expect(modelExtFromUrl("ring.GLB")).toBe("glb");
  });

  it("matches presigned URLs with a query string", () => {
    expect(
      modelExtFromUrl(
        "https://r2.example.com/customers/1/models/ring.glb?X-Amz-Signature=fake123&X-Amz-Expires=900",
      ),
    ).toBe("glb");
    expect(modelExtFromUrl("http://localhost:3000/test-fixtures/PDR-2413.glb?X-Amz-Signature=fake123")).toBe("glb");
  });

  it("matches URLs with a hash suffix", () => {
    expect(modelExtFromUrl("ring.glb#section")).toBe("glb");
    expect(modelExtFromUrl("https://cdn.example.com/ring.gltf?v=2#frag")).toBe("gltf");
  });

  it("returns null for non-model extensions", () => {
    expect(modelExtFromUrl("render.png")).toBeNull();
    expect(modelExtFromUrl("https://cdn.example.com/render.png?sig=abc")).toBeNull();
  });

  it("does not false-positive on model extensions inside the query string", () => {
    expect(modelExtFromUrl("https://cdn.example.com/render.png?file=ring.glb")).toBeNull();
  });
});

describe("viewerIdFromModelKey", () => {
  it("strips customers/<id>/models/ prefix", () => {
    expect(viewerIdFromModelKey("customers/42/models/ring.glb")).toBe("ring.glb");
  });

  it("strips models/ prefix", () => {
    expect(viewerIdFromModelKey("models/ring.glb")).toBe("ring.glb");
  });
});
