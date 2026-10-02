import type { PieceKind } from "@/lib/jewelry-cad";

/**
 * Camera presets for the preview, in preview units (the piece is scaled so ~22 mm ≈ 1).
 * Rings stand upright with the finger along z; studs and pendants face +z.
 */

export type PreviewView = "perspective" | "front" | "side" | "top" | "detail";

export const PREVIEW_VIEWS: Array<{ value: PreviewView; label: string }> = [
  { value: "perspective", label: "3/4" },
  { value: "front", label: "Front" },
  { value: "side", label: "Side" },
  { value: "top", label: "Top" },
  { value: "detail", label: "Detail" },
];

export type CameraPose = { position: [number, number, number]; target: [number, number, number] };

/** Millimetres → preview units. Fixed (not fit-to-box) so size changes read as size changes. */
export const PREVIEW_UNITS_PER_MM = 1 / 22;

export function isPreviewView(value: string | null | undefined): value is PreviewView {
  return PREVIEW_VIEWS.some((v) => v.value === value);
}

export function cameraPoseFor(view: PreviewView, kind: PieceKind, headY: number): CameraPose {
  const ring = kind === "ring";
  switch (view) {
    case "front":
      return { position: [0, 0.12, 2.9], target: [0, 0.02, 0] };
    case "side":
      return ring ? { position: [2.9, 0.12, 0], target: [0, 0.02, 0] } : { position: [2.2, 0.1, 1.2], target: [0, 0, 0] };
    case "top":
      return ring ? { position: [0.001, 2.9, 0.35], target: [0, 0, 0] } : { position: [0, 2.8, 0.9], target: [0, 0, 0] };
    case "detail":
      return ring
        ? { position: [0.62, headY + 0.6, 0.78], target: [0, headY, 0] }
        : { position: [0.5, 0.45, 1.05], target: [0, 0, 0] };
    default:
      return ring ? { position: [1.55, 0.95, 2.05], target: [0, 0.04, 0] } : { position: [1.3, 0.85, 2.1], target: [0, 0, 0] };
  }
}
