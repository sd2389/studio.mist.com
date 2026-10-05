import { captureFrameToDataUrl } from "@/stores/screenshot-store";

/** A thumbnail's longest side: no bigger than a screenshot of the studio (ADR 0005). */
export const THUMBNAIL_MAX_EDGE = 1024;
/** The WebP quality the browser encodes a capture at; the API keeps a WebP of its own. */
const THUMBNAIL_QUALITY = 0.9;

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The view couldn't be captured"))),
      "image/webp",
      THUMBNAIL_QUALITY,
    );
  });
}

/**
 * The live view as a thumbnail: what the viewer shows, at most 1024 px on its longest side and
 * unmarked, as WebP (PNG in a browser that can't encode WebP). Null before the viewer draws.
 */
export async function captureViewThumbnail(): Promise<Blob | null> {
  const frame = captureFrameToDataUrl({ maxEdge: THUMBNAIL_MAX_EDGE, watermark: false });
  if (!frame) return null;
  const image = new Image();
  image.src = frame;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  return canvasToBlob(canvas);
}
