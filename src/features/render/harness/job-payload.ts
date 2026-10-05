import type { LookSnapshot } from "@/features/viewer";
import type { SceneLook } from "@/lib/api/scenes";
import { LIGHTING_PRESETS } from "@/lib/viewer-lighting";
import { BUILT_IN_ANGLES } from "../campaign-pack/domain/defaults";
import type { BuiltInAngleId, Vec3 } from "../campaign-pack/domain/types";

/*
 * The render job as the worker hands it to the harness's export mode, and what the page hands
 * back (ADR 0005). `payload` is `GET /render-jobs/{id}/payload` exactly as the API sends it,
 * snake_case and all: backend/app/features/render_jobs/ builds it, scripts/render-worker/
 * passes it through untouched, and this module reads it. Change the three together.
 */

/** The live view (`captureCurrentCameraPose`), drawn with the viewer's 42° lens. */
export type ViewCamera = { view: { position: Vec3; target: Vec3 } };
/** A saved pose of the look (`scene_settings.poses`) or one of `DEFAULT_POSES`, by id. */
export type PoseCamera = { pose: string };
/** A Campaign Pack angle, framed on the model's bounds with the pack's 30° lens; margin 0 to 20%. */
export type AngleCamera = { angle: BuiltInAngleId; margin_pct?: number };
export type CameraSpec = ViewCamera | PoseCamera | AngleCamera;

/** What every image of a still or an angle set shares. */
export type ImageSpec = {
  width: number;
  height: number;
  format: "png" | "jpeg";
  /** 0.8 to 1; JPEG only. */
  jpeg_quality: number;
  /** A PNG cutout: the piece alone, without the set and its shadow. A transparent JPEG is white. */
  transparent: boolean;
  /** The file names the API gave the images when it normalised the spec, in camera order. */
  output_names: string[];
};

export type StillSpec = ImageSpec & { camera: CameraSpec };
export type AngleSetSpec = ImageSpec & { cameras: CameraSpec[] };

type PayloadBase = {
  /** The look, frozen when the job was created: what the studio autosaves. */
  look: LookSnapshot;
  /** The catalogue items and library materials the look names. */
  look_items: SceneLook;
  /** Where the worker gets the model; the page reads the worker's copy from the sink. */
  model: { url: string } | { path: string };
  /** The owner's plan marks every image (Free). */
  watermark: boolean;
  limits: { max_edge: number; max_runtime_seconds: number };
  scene: { id: number; name: string | null; sku: string | null };
};

export type RenderJobPayload =
  | (PayloadBase & { kind: "still"; spec: StillSpec })
  | (PayloadBase & { kind: "angle_set"; spec: AngleSetSpec });

/** The worker's loopback server for one job. Every request carries the token in `SINK_TOKEN_HEADER`. */
export type SinkAddress = { url: string; token: string };

/**
 * `window.__RENDER_JOB__`, set by the worker with an init script before the page loads. The
 * page holds no API token: the worker makes every API call and serves the model through the sink.
 */
export type HarnessJob = { payload: RenderJobPayload; sink: SinkAddress };

export const SINK_TOKEN_HEADER = "X-Sink-Token";

/** What the page reports to the sink's `POST /progress`; the worker adds `encoding` and `uploading`. */
export type RenderStage = "loading" | "rendering";

/** One image the page posted to the sink, as `complete` lists it (the worker adds `key` and `bytes`). */
export type RenderedFile = {
  name: string;
  content_type: string;
  width: number;
  height: number;
  /** The angle or pose id; none for the live view. */
  label: string | null;
};

/** What drew the job (its `renderer` column). */
export type RendererInfo = {
  browser: string;
  backend: "webgpu" | "webgl2";
  adapter: { vendor: string; architecture: string; device: string; description: string } | null;
};

/** `window.__RENDER_RESULT__`, once the page reports "done" (export) or "ready" (probe). */
export type HarnessResult = { renderer: RendererInfo; outputs: RenderedFile[] };

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(field: string): never {
  throw new Error(`invalid render job: ${field}`);
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n));
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function readCamera(raw: unknown, field: string): CameraSpec {
  if (!isObject(raw)) invalid(field);
  if ("view" in raw) {
    const view = raw.view;
    if (!isObject(view) || !isVec3(view.position) || !isVec3(view.target)) invalid(`${field}.view`);
    return { view: { position: view.position, target: view.target } };
  }
  if ("pose" in raw) {
    if (typeof raw.pose !== "string" || !raw.pose) invalid(`${field}.pose`);
    return { pose: raw.pose };
  }
  const angle = BUILT_IN_ANGLES.find((built) => built.id === raw.angle);
  if (!angle) invalid(`${field}.angle`);
  if (raw.margin_pct === undefined) return { angle: angle.id };
  if (typeof raw.margin_pct !== "number" || !Number.isFinite(raw.margin_pct)) invalid(`${field}.margin_pct`);
  return { angle: angle.id, margin_pct: raw.margin_pct };
}

function readCameras(kind: unknown, spec: Json): CameraSpec[] {
  if (kind === "still") return [readCamera(spec.camera, "spec.camera")];
  // Other kinds come with their own modes (turntable, spin, campaign_pack, convert).
  if (kind !== "angle_set") invalid(`kind "${String(kind)}" (the export mode renders still and angle_set)`);
  if (!Array.isArray(spec.cameras) || spec.cameras.length === 0) invalid("spec.cameras");
  return spec.cameras.map((camera, index) => readCamera(camera, `spec.cameras[${index}]`));
}

function readImageSpec(spec: Json, imageCount: number): ImageSpec {
  const { width, height, format, jpeg_quality, transparent, output_names } = spec;
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) invalid("spec.width/height");
  if (format !== "png" && format !== "jpeg") invalid("spec.format");
  if (typeof jpeg_quality !== "number" || !(jpeg_quality > 0 && jpeg_quality <= 1)) invalid("spec.jpeg_quality");
  if (typeof transparent !== "boolean") invalid("spec.transparent");
  const names = Array.isArray(output_names) ? output_names : [];
  if (names.length !== imageCount || !names.every((name) => typeof name === "string" && name)) {
    invalid("spec.output_names");
  }
  return { width, height, format, jpeg_quality, transparent, output_names: names as string[] };
}

function readLook(raw: unknown): LookSnapshot {
  if (!isObject(raw) || typeof raw.material !== "string") invalid("look.material");
  if (typeof raw.lighting !== "string" || !Object.hasOwn(LIGHTING_PRESETS, raw.lighting)) invalid("look.lighting");
  for (const field of ["slot_selections", "scene_settings", "model_config"]) {
    if (!isObject(raw[field])) invalid(`look.${field}`);
  }
  return raw as LookSnapshot;
}

function readLookItems(raw: unknown): SceneLook {
  if (!isObject(raw)) invalid("look_items");
  for (const field of ["environments", "backgrounds", "grounds", "metals", "gems", "user_materials"]) {
    if (!Array.isArray(raw[field])) invalid(`look_items.${field}`);
  }
  return raw as SceneLook;
}

function readSink(raw: unknown): SinkAddress {
  if (!isObject(raw) || typeof raw.url !== "string" || typeof raw.token !== "string" || !raw.token) invalid("sink");
  return { url: raw.url, token: raw.token };
}

/**
 * The job in `window.__RENDER_JOB__`, checked as far as the page relies on it. The API has
 * validated it in full; this only turns a malformed hand-off into a clear error.
 */
export function readHarnessJob(raw: unknown): HarnessJob {
  if (!isObject(raw) || !isObject(raw.payload)) invalid("payload");
  const payload = raw.payload;
  if (!isObject(payload.spec)) invalid("spec");
  const cameras = readCameras(payload.kind, payload.spec);
  const image = readImageSpec(payload.spec, cameras.length);
  const spec = payload.kind === "still" ? { ...image, camera: cameras[0]! } : { ...image, cameras };
  const limits = payload.limits;
  if (!isObject(limits) || typeof limits.max_edge !== "number" || !(limits.max_edge > 0)) invalid("limits.max_edge");
  if (typeof payload.watermark !== "boolean") invalid("watermark");
  return {
    payload: {
      ...payload,
      look: readLook(payload.look),
      look_items: readLookItems(payload.look_items),
      spec,
    } as RenderJobPayload,
    sink: readSink(raw.sink),
  };
}

/** A still's one camera, or an angle set's cameras, in output order. */
export function jobCameras(payload: RenderJobPayload): CameraSpec[] {
  return payload.kind === "still" ? [payload.spec.camera] : payload.spec.cameras;
}
