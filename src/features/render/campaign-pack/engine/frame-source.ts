import { WHITE_BACKDROP, type ExportBackdrop } from "@/lib/export-backdrop";
import type { ExportCanvas, OffscreenRenderSession } from "@/lib/offscreen-render";
import type { StageControl } from "../../lib/stage-visibility";
import { STILL_EXPORT_SAMPLES } from "@/lib/export-supersample";

export type FrameSourceOptions = {
  /** Keep the studio set and scene background in opaque outputs (the viewport look). */
  sceneLook: boolean;
  /** Contact shadow under the piece in opaque outputs. Cutouts never carry it. */
  contactShadow: boolean;
  /** Clean backdrop, or the fallback behind a scene that has no background of its own. */
  backdrop: ExportBackdrop;
  backdropImage: CanvasImageSource | null;
  /** ASET scope on the piece's traced gems; forced off for every photographic capture. */
  setGemScope: (enabled: boolean) => void;
};

export type StillWant = {
  cutout: boolean;
  flat: boolean;
  /** Per-shot override of the contact shadow (e.g. off for overhead views). */
  contactShadow?: boolean;
};

export type FrameSource = {
  /** Opaque frame for JPG, 360° spin and MP4. */
  flat(timeSec: number): ExportCanvas;
  /** One still: transparent cutout (piece alone) and/or the opaque frame. */
  still(want: StillWant): { cutout: ExportCanvas | null; flat: ExportCanvas | null };
  /** ASET cut-quality frame: piece alone on white, stones in false colour. */
  scope(): ExportCanvas;
};

/**
 * Decides how each output is drawn. Cutouts are the piece alone; opaque frames sit on the
 * clean backdrop, or keep the styled set when the pack asks for the scene's own look.
 * Returned canvases must be read (encoded) before the next call.
 */
export function createFrameSource(
  session: OffscreenRenderSession,
  stage: StageControl,
  options: FrameSourceOptions,
): FrameSource {
  const { backdrop, backdropImage, setGemScope } = options;
  const pieceAlone = () => {
    stage.showSet(false);
    stage.showShadows(false);
  };
  const cutoutLayer = (): ExportCanvas => {
    pieceAlone();
    setGemScope(false);
    return session.capture({ backdrop: null, backdropImage, cutout: true, samples: STILL_EXPORT_SAMPLES }).cutout!;
  };
  // Stills are supersampled; turntable and spin frames stay single-sample (motion hides it).
  const flat = (timeSec: number, contactShadow = options.contactShadow, samples = 1): ExportCanvas => {
    stage.showSet(options.sceneLook);
    stage.showShadows(contactShadow);
    setGemScope(false);
    if (options.sceneLook && session.hasOpaqueBackground) return session.render({ timeSec, samples });
    return session.capture({ timeSec, backdrop, backdropImage, cutout: false, samples }).flat!;
  };
  return {
    flat: (timeSec) => flat(timeSec),
    still(want) {
      // Cutout first: the flat render only touches the WebGPU canvas and the flat layer.
      const cutout = want.cutout ? cutoutLayer() : null;
      const shadow = options.contactShadow && want.contactShadow !== false;
      return { cutout, flat: want.flat ? flat(0, shadow, STILL_EXPORT_SAMPLES) : null };
    },
    scope() {
      pieceAlone();
      setGemScope(true);
      try {
        return session.capture({ backdrop: WHITE_BACKDROP, cutout: false, samples: STILL_EXPORT_SAMPLES }).flat!;
      } finally {
        setGemScope(false);
      }
    },
  };
}
