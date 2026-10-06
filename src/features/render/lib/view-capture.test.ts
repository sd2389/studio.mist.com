import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportLimits } from "@/lib/export-limits";
import { useScreenshotStore } from "@/stores/screenshot-store";
import { captureViewThumbnail, THUMBNAIL_MAX_EDGE } from "./view-capture";

/** The browser pieces a capture uses: an image that decodes, and a canvas that encodes. */
function stubBrowser() {
  const drawn: unknown[] = [];
  const encoded: Array<{ type: string; quality: number }> = [];
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      naturalWidth = 1024;
      naturalHeight = 576;
      decode() {
        return Promise.resolve();
      }
    },
  );
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (image: unknown) => drawn.push(image) }),
      toBlob(done: (blob: Blob | null) => void, type: string, quality: number) {
        encoded.push({ type, quality });
        done(new Blob(["webp"], { type }));
      },
    }),
  });
  return { drawn, encoded };
}

describe("captureViewThumbnail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useScreenshotStore.setState({ captureFn: null });
  });

  it("reads the live view at no more than 1024 px a side, unmarked, and encodes it as WebP", async () => {
    const captures: Array<ExportLimits | undefined> = [];
    useScreenshotStore.setState({
      captureFn: (limits) => {
        captures.push(limits);
        return "data:image/png;base64,iVBORw0KGgo=";
      },
    });
    const { drawn, encoded } = stubBrowser();

    const image = await captureViewThumbnail();

    expect(captures).toEqual([{ maxEdge: THUMBNAIL_MAX_EDGE, watermark: false }]);
    expect(THUMBNAIL_MAX_EDGE).toBe(1024);
    expect(drawn).toHaveLength(1);
    expect(encoded).toEqual([{ type: "image/webp", quality: 0.9 }]);
    expect(image?.type).toBe("image/webp");
  });

  it("is null before the viewer draws", async () => {
    expect(await captureViewThumbnail()).toBeNull();
  });
});
