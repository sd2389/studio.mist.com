import type { LookSnapshot } from "@/features/viewer";
import { computeImageSize } from "@/lib/export-presets";
import type { StillExportOptions } from "../ui/StillExportSettings";
import type { RenderJob, RenderJobCamera, RenderJobRequest, StillJobSpec } from "./render-jobs-api";

/*
 * The create requests the studio sends (ADR 0005). Pure: the camera and the look come in, so
 * the Exports page, which has no viewer, can ask for a job again without loading one.
 */

/** The lowest JPEG quality a job takes (backend/app/features/render_jobs/specs.py); the highest is 1. */
export const JOB_JPEG_QUALITY_MIN = 0.8;
/** A Quick still's longest side: 1 credit at any aspect ratio (ADR 0005). */
export const QUICK_STILL_EDGE = 2048;
/** The shortest side a job renders. */
const MIN_JOB_EDGE = 64;

/** Kinds whose `frames` the API counts itself; a video's or a spin's is the request's own setting. */
const IMAGE_JOB_KINDS: ReadonlySet<string> = new Set(["still", "angle_set"]);

/** A still's spec from the still settings (`StillExportSettings`), seen from `camera`. */
export function stillJobSpec(options: StillExportOptions, camera: RenderJobCamera): StillJobSpec {
  const { width, height } = computeImageSize(options.resolution, options.aspect);
  return {
    camera,
    width,
    height,
    format: options.format,
    jpeg_quality: Math.min(1, Math.max(JOB_JPEG_QUALITY_MIN, options.jpegQuality)),
    transparent: options.transparent,
  };
}

/**
 * A Quick still's spec, which "Download PNG" becomes: the viewport's aspect ratio at 2048 px on
 * its longest side, a PNG of the set as shown, seen from `camera`.
 */
export function quickStillSpec(viewport: { width: number; height: number }, camera: RenderJobCamera): StillJobSpec {
  // A viewport with no size yet (hidden, or still laying out) gets a square.
  const ratio = viewport.width > 0 && viewport.height > 0 ? viewport.width / viewport.height : 1;
  const across = (side: number) => Math.max(MIN_JOB_EDGE, Math.round(side));
  const [width, height] =
    ratio >= 1 ? [QUICK_STILL_EDGE, across(QUICK_STILL_EDGE / ratio)] : [across(QUICK_STILL_EDGE * ratio), QUICK_STILL_EDGE];
  return { camera, width, height, format: "png", transparent: false };
}

type StillJobTarget = {
  sceneId: number;
  /** The studio's current look; without it, the saved variant's, else the scene's saved look. */
  look?: LookSnapshot | null;
  variantId?: string | null;
  /** The file's stem. */
  name: string;
};

/** A `still` job of a saved scene. */
export function stillJobRequest(
  spec: StillJobSpec,
  { sceneId, look = null, variantId = null, name }: StillJobTarget,
): RenderJobRequest {
  return { kind: "still", scene_id: sceneId, variant_id: variantId, look, name, spec };
}

/** What the API adds to a spec when it takes a job: the file names (`outputs` before A2), an image job's count. */
function addedSpecFields(kind: string): string[] {
  const names = ["output_names", "outputs"];
  return IMAGE_JOB_KINDS.has(kind) ? [...names, "frames"] : names;
}

/**
 * The request that makes `job` again (its Retry): the kind, scene, saved variant, kept look and
 * file stem it was asked for, and its spec less what the API added when it took it. Null for a
 * job of no scene, which the studio can't ask for.
 */
export function jobRetryRequest(job: RenderJob): RenderJobRequest | null {
  if (job.scene_id === null) return null;
  const added = addedSpecFields(job.kind);
  const spec = Object.fromEntries(Object.entries(job.spec).filter(([field]) => !added.includes(field)));
  // The API checks the kind and spec, as it did the first time.
  return {
    kind: job.kind,
    scene_id: job.scene_id,
    variant_id: job.variant_id,
    look: job.look,
    name: job.name,
    spec,
  } as RenderJobRequest;
}
