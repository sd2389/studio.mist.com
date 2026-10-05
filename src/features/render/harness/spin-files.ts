import { frameNumber } from "../campaign-pack/domain/naming";
import { buildSpinViewerHtml } from "../campaign-pack/domain/spin-viewer";
import type { PayloadOfKind, SpinSpec } from "./job-payload";

/** The viewer page's name: it sits next to the frames in the spin's ZIP and loads them by name. */
export const SPIN_VIEWER_NAME = "spin.html";

/** The title the viewer page shows when the scene has neither a name nor a SKU. */
const UNTITLED = "Spin";

/** The frames' file names in turning order, numbered as the Campaign Pack numbers its spin frames. */
export function spinFrameNames({ frames, format }: Pick<SpinSpec, "frames" | "format">): string[] {
  const extension = format === "jpeg" ? "jpg" : "png";
  return Array.from({ length: frames }, (_, index) => `frame_${frameNumber(index, frames)}.${extension}`);
}

/** `spin.html`: the Campaign Pack's offline 360° viewer (`spin-viewer.ts`), turning through these frames. */
export function spinViewerPage(payload: PayloadOfKind<"spin">, frameNames: string[]): string {
  const title = payload.scene.name?.trim() || payload.scene.sku?.trim() || UNTITLED;
  return buildSpinViewerHtml({
    title,
    size: payload.spec.size,
    // One look, so the page shows no metal picker.
    metals: [{ slug: "spin", label: title, frames: frameNames }],
  });
}
