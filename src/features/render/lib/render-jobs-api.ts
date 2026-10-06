import type { LookSnapshot } from "@/features/viewer";
import { apiGet, apiPost } from "@/lib/api/client";
import type { Vec3 } from "@/lib/camera-orbit";
import type { BuiltInAngleId } from "../campaign-pack/domain/types";

/*
 * Server render jobs (ADR 0005), through the Next proxies in src/app/api/render-jobs/. The
 * types mirror the API's: backend/app/schemas/render_job.py for what it answers, and
 * backend/app/features/render_jobs/specs.py for the specs it takes.
 */

/** The live view (`captureCurrentCameraPose`), a saved or built-in pose by id, or a Campaign Pack angle. */
export type RenderJobCamera =
  | { view: { position: Vec3; target: Vec3 } }
  | { pose: string }
  | { angle: BuiltInAngleId; margin_pct?: number };

/** What every image of a still or an angle set shares; the API fills in the defaults. */
export type ImageJobSpec = {
  /** 64 to 8192 px, within the plan's cap; at most 36 MP an image. */
  width: number;
  height: number;
  format?: "png" | "jpeg";
  /** 0.8 to 1; JPEG only. */
  jpeg_quality?: number;
  /** A PNG cutout without the set and its shadow; a transparent JPEG is white. */
  transparent?: boolean;
};

export type StillJobSpec = ImageJobSpec & { camera: RenderJobCamera };
/** One look from 1 to 12 cameras. */
export type AngleSetJobSpec = ImageJobSpec & { cameras: RenderJobCamera[] };

/**
 * Where a turntable's camera goes: once round the target from a start camera, frame 0 being
 * that camera (the studio's turntable of the live view), or a cut through poses by id, each
 * held for an equal share of the frames (its "Multi-angle"). The poses are the look's saved
 * ones or the studio's four built-in ones.
 */
export type TurntablePath = { orbit: { start: RenderJobCamera } } | { poses: string[] };

/** How the worker encodes a video: x264 at CRF 23, 20 or 17. */
export type VideoQuality = "standard" | "high" | "max";

/** A video, rendered frame by frame and encoded on the server as one H.264 MP4. */
export type TurntableJobSpec = {
  /** Even both, for H.264's 4:2:0 chroma; within the plan's cap, and 8K only on plans with 8K video. */
  width: number;
  height: number;
  /** 1 to 60, within the plan's (Free: 30). */
  fps: number;
  /** At most 3,600, and the plan's length at `fps` (Free: 20 s); a cut through poses needs one a pose. */
  frames: number;
  /** "high" when left out. */
  quality?: VideoQuality;
  path: TurntablePath;
};

/**
 * The look a job keeps: the snapshot it was sent, validated, with a background image kept as
 * `{ type: "image", asset_id }` rather than an address.
 */
export type RenderJobLook = Record<string, unknown>;

/** A create body (`RenderJobCreate`), for the kinds the API renders so far. */
export type RenderJobRequest = {
  scene_id: number;
  /** A saved variant's look, when `look` is left out. */
  variant_id?: string | null;
  /**
   * The studio's current look (`lookSnapshot`), or the look a job kept when it is asked for
   * again; without it, the variant's or the scene's saved look.
   */
  look?: LookSnapshot | RenderJobLook | null;
  /** The outputs' file stem; the scene's SKU or name without it. */
  name?: string | null;
} & (
  | { kind: "still"; spec: StillJobSpec }
  | { kind: "angle_set"; spec: AngleSetJobSpec }
  | { kind: "turntable"; spec: TurntableJobSpec }
);

export type RenderJobStatus = "queued" | "running" | "completed" | "failed" | "canceled";

/** One file a job made: a row in the scene's renders. */
export type RenderJobOutput = {
  id: number;
  kind: string;
  label: string | null;
  filename: string | null;
  content_type: string | null;
  bytes: number;
  width: number | null;
  height: number | null;
  /** The API's own path; the studio downloads through `outputDownloadUrl`. */
  download_url: string;
};

/** A job, as every user endpoint answers (`RenderJobOut`). */
export type RenderJob = {
  id: number;
  kind: string;
  status: RenderJobStatus;
  scene_id: number | null;
  batch_id: number | null;
  /**
   * The normalised spec, which carries `frames` and `output_names`; turntables and spins have
   * their own `frames`. A turntable makes one `.mp4`, a spin one `-spin.zip`, and a Campaign Pack
   * one `_campaign-pack.zip`.
   */
  spec: Record<string, unknown>;
  /** What else its request named, so the same job can be asked for again (null on older jobs). */
  look: RenderJobLook | null;
  variant_id: string | null;
  name: string | null;
  watermark: boolean;
  /** Held while it renders, charged when it completes, refunded when it fails or is canceled. */
  credits: number;
  credit_state: "held" | "charged" | "refunded" | "none";
  /** 0 to 1. */
  progress: number;
  /** What a running job's worker is doing: `loading`, `rendering`, `encoding` or `uploading`. */
  stage: string | null;
  attempts: number;
  error: string | null;
  error_code: string | null;
  cancel_requested_at: string | null;
  outputs: RenderJobOutput[];
  /** UTC, ending in Z (`parseApiTime` reads it). */
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

/** The caller's jobs, newest first; `next_before` is the next page's `before`, null on the last page. */
export type RenderJobPage = { items: RenderJob[]; next_before: number | null };

/** What a job would cost and make, before anything is spent. */
export type RenderJobQuote = {
  credits: number;
  width: number;
  height: number;
  frames: number;
  outputs: string[];
  watermark: boolean;
  warnings: string[];
};

/** Why a job or a request can't be made: the status creating it would answer (402, 404, 400), and why. */
export type RenderJobRefusal = { status: number; detail: string };

/** One job of a bulk quote: what it would cost and make, or why it can't be made. */
export type RenderJobBulkQuoteItem = { quote: RenderJobQuote | null; refused: RenderJobRefusal | null };

/** What a bulk request would cost, job by job, before anything is spent. */
export type RenderJobBulkQuote = {
  /** The jobs that can be made, together. */
  credits: number;
  /** In the request's order. */
  items: RenderJobBulkQuoteItem[];
  /** Why the plan refuses the request as a whole (Free has no bulk requests); its jobs are still priced. */
  refused: RenderJobRefusal | null;
  warnings: string[];
};

export type RenderJobFilter = Partial<{
  scene_id: number;
  batch_id: number;
  kind: string;
  status: RenderJobStatus;
  /** Jobs older than this id: the previous page's `next_before`. */
  before: number;
  /** 1 to 100; the API's default is 50. */
  limit: number;
}>;

type CallOptions = { signal?: AbortSignal };

/**
 * Queues a job; its credits are held until it ends. A repeated `idempotencyKey` with the same
 * request answers the job it made instead of a new one, so a retried click can't render twice.
 */
export function createRenderJob(
  request: RenderJobRequest,
  { idempotencyKey = crypto.randomUUID(), signal }: CallOptions & { idempotencyKey?: string } = {},
): Promise<RenderJob> {
  return apiPost<RenderJob>("/api/render-jobs", request, {
    headers: { "Idempotency-Key": idempotencyKey },
    signal,
  });
}

/**
 * Queues up to 100 jobs at once (Grow and Studio), all or none. Like a single job, a repeated
 * `idempotencyKey` with the same requests answers the jobs the first call made.
 */
export async function createRenderJobs(
  requests: RenderJobRequest[],
  { idempotencyKey = crypto.randomUUID(), signal }: CallOptions & { idempotencyKey?: string } = {},
): Promise<RenderJob[]> {
  const { jobs } = await apiPost<{ jobs: RenderJob[] }>(
    "/api/render-jobs/bulk",
    { jobs: requests },
    { headers: { "Idempotency-Key": idempotencyKey }, signal },
  );
  return jobs;
}

/** What `request` would cost; nothing is held or queued. */
export function quoteRenderJob(request: RenderJobRequest, { signal }: CallOptions = {}): Promise<RenderJobQuote> {
  return apiPost<RenderJobQuote>("/api/render-jobs/quote", request, { signal });
}

/** What a bulk request would cost: each job's quote or why it can't be made, and the total. Nothing is held or queued. */
export function quoteRenderJobs(requests: RenderJobRequest[], { signal }: CallOptions = {}): Promise<RenderJobBulkQuote> {
  return apiPost<RenderJobBulkQuote>("/api/render-jobs/bulk/quote", { jobs: requests }, { signal });
}

export function getRenderJob(jobId: number, { signal }: CallOptions = {}): Promise<RenderJob> {
  return apiGet<RenderJob>(`/api/render-jobs/${jobId}`, { signal });
}

export function listRenderJobs(filter: RenderJobFilter = {}, { signal }: CallOptions = {}): Promise<RenderJobPage> {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(filter)) {
    if (value !== undefined) search.set(name, String(value));
  }
  const query = search.toString();
  return apiGet<RenderJobPage>(`/api/render-jobs${query ? `?${query}` : ""}`, { signal });
}

/** A queued job is canceled and refunded at once; a running one when its worker stops. */
export function cancelRenderJob(jobId: number): Promise<RenderJob> {
  return apiPost<RenderJob>(`/api/render-jobs/${jobId}/cancel`, {});
}

/** Where the browser downloads an output: the proxy answers with the file or a short-lived signed link. */
export function outputDownloadUrl(jobId: number, outputId: number): string {
  return `/api/render-jobs/${jobId}/outputs/${outputId}/download`;
}
