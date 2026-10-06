import type { PackDocument } from "../domain/documents";
import type {
  PackFailure,
  PackFileRecord,
  PackJob,
  PackMetalId,
  PackPlan,
  ScopeJob,
  SpinJob,
  StillJob,
  TurntableJob,
} from "../domain/types";
import type { PackRenderBackend } from "./pack-backend";

export type PackProgress = {
  fraction: number;
  label: string;
  filesWritten: number;
  failures: number;
  elapsedMs: number;
  /** Null until enough work is done to extrapolate. */
  etaMs: number | null;
};

/**
 * Where a pack's files go, one after another in the order of its ZIP: the ZIP itself, in memory
 * (`PackZipWriter`, the browser's pack), or the render worker's sink, which puts them in one ZIP
 * on the server (the harness's).
 */
export type PackFileWriter = {
  /** Stores one file and resolves with its size. `compress` deflates it: text, where media is compressed already. */
  add(path: string, data: Blob | string, options?: { compress?: boolean }): Promise<number>;
};

/** What a run made: every file, in the order it was written, and what was left out. */
export type PackRun = {
  files: PackFileRecord[];
  failures: PackFailure[];
  notices: string[];
  elapsedMs: number;
};

export type RunCampaignPackInput = {
  plan: PackPlan;
  backend: PackRenderBackend;
  writer: PackFileWriter;
  buildDocuments: (files: PackFileRecord[], failures: PackFailure[]) => PackDocument[];
  signal?: AbortSignal;
  onProgress?: (progress: PackProgress) => void;
  now?: () => number;
};

const ETA_MIN_FRACTION = 0.02;
const ETA_MIN_ELAPSED_MS = 1500;

/** Stops with what aborted the run: an AbortError when it was cancelled. */
function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

function createTracker(input: RunCampaignPackInput, files: PackFileRecord[], failures: PackFailure[]) {
  const now = input.now ?? (() => performance.now());
  const total = Math.max(input.plan.totals.units, 1e-9);
  const startedAt = now();
  let done = 0;
  let label = "";
  const snapshot = (): PackProgress => {
    const elapsedMs = now() - startedAt;
    const fraction = Math.min(1, done / total);
    const canEstimate = fraction >= ETA_MIN_FRACTION && elapsedMs >= ETA_MIN_ELAPSED_MS;
    return {
      fraction,
      label,
      filesWritten: files.length,
      failures: failures.length,
      elapsedMs,
      etaMs: canEstimate ? (elapsedMs / fraction) * (1 - fraction) : null,
    };
  };
  return {
    label(next: string) {
      label = next;
      input.onProgress?.(snapshot());
    },
    advance(units: number, next?: string) {
      done = Math.min(total, done + units);
      if (next) label = next;
      input.onProgress?.(snapshot());
    },
    doneUnits: () => done,
    elapsed: () => now() - startedAt,
    complete: () => {
      done = total;
      input.onProgress?.(snapshot());
    },
  };
}

type Tracker = ReturnType<typeof createTracker>;

type JobContext = {
  backend: PackRenderBackend;
  writer: PackFileWriter;
  files: PackFileRecord[];
  metalSlug: (metal: PackMetalId) => string;
  tracker: Tracker;
  signal?: AbortSignal;
};

async function writeFile(ctx: JobContext, record: Omit<PackFileRecord, "bytes">, data: Blob): Promise<void> {
  const bytes = await ctx.writer.add(record.path, data);
  ctx.files.push({ ...record, bytes });
}

async function runStill(job: StillJob, ctx: JobContext): Promise<void> {
  const out = await ctx.backend.renderStill(job);
  const base = { metal: ctx.metalSlug(job.metal), angle: job.angle.slug, width: job.size, height: job.size };
  if (job.jpgPath && out.jpg) await writeFile(ctx, { ...base, path: job.jpgPath, kind: "still-jpg" }, out.jpg);
  if (job.pngPath && out.png) await writeFile(ctx, { ...base, path: job.pngPath, kind: "still-png" }, out.png);
  ctx.tracker.advance(job.units);
}

/** Frames are buffered and written together so a failed spin never ships half a turn. */
async function runSpin(job: SpinJob, ctx: JobContext): Promise<void> {
  const total = job.framePaths.length;
  const frames: Blob[] = [];
  for (let i = 0; i < total; i++) {
    throwIfAborted(ctx.signal);
    frames.push(await ctx.backend.renderSpinFrame(job, i));
    ctx.tracker.advance(job.units / total, `${job.label} · frame ${i + 1}/${total}`);
  }
  const metal = ctx.metalSlug(job.metal);
  for (let i = 0; i < total; i++) {
    const record = { path: job.framePaths[i]!, kind: "spin-frame" as const, metal, width: job.size, height: job.size };
    await writeFile(ctx, record, frames[i]!);
  }
}

async function runTurntable(job: TurntableJob, ctx: JobContext): Promise<void> {
  const video = await ctx.backend.renderTurntable(
    job,
    (index) => ctx.tracker.advance(job.units / job.frameCount, `${job.label} · frame ${index + 1}/${job.frameCount}`),
    ctx.signal,
  );
  const record = { path: job.path, kind: "video" as const, metal: ctx.metalSlug(job.metal), width: job.width, height: job.height };
  // The server's MP4 is written where its frames went, by the worker's ffmpeg; the browser's comes back to store.
  if (typeof video === "number") ctx.files.push({ ...record, bytes: video });
  else await writeFile(ctx, record, video);
}

async function runScope(job: ScopeJob, ctx: JobContext): Promise<void> {
  const blob = await ctx.backend.renderScope(job);
  await writeFile(ctx, { path: job.path, kind: "scope", angle: "top", width: job.size, height: job.size }, blob);
  ctx.tracker.advance(job.units);
}

function runJob(job: PackJob, ctx: JobContext): Promise<void> {
  if (job.kind === "still") return runStill(job, ctx);
  if (job.kind === "spin") return runSpin(job, ctx);
  if (job.kind === "scope") return runScope(job, ctx);
  return runTurntable(job, ctx);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Renders every planned job, keeps going past failures (each is reported), writes each output
 * as it is made, then appends the generated documents. Aborting stops the run with the signal's
 * reason (an AbortError when it was cancelled) and writes nothing more.
 */
export async function runCampaignPack(input: RunCampaignPackInput): Promise<PackRun> {
  const { plan, backend, writer, signal } = input;
  const files: PackFileRecord[] = [];
  const failures: PackFailure[] = [];
  const tracker = createTracker(input, files, failures);
  const slugs = new Map(plan.metals.map((metal) => [metal.id, metal.slug]));
  const ctx: JobContext = {
    backend,
    writer,
    files,
    metalSlug: (metal) => slugs.get(metal) ?? metal,
    tracker,
    signal,
  };
  let activeMetal: PackMetalId | null = null;

  for (const job of plan.jobs) {
    throwIfAborted(signal);
    tracker.label(job.label);
    const unitsBefore = tracker.doneUnits();
    try {
      if (job.metal !== activeMetal) {
        activeMetal = null;
        await backend.setMetal(job.metal);
        activeMetal = job.metal;
      }
      await runJob(job, ctx);
    } catch (error) {
      if (isAbort(error)) throw error;
      // Whatever failed once the run was stopped, the run stops for what stopped it.
      throwIfAborted(signal);
      failures.push({ jobId: job.id, label: job.label, message: errorMessage(error) });
      tracker.advance(Math.max(0, job.units - (tracker.doneUnits() - unitsBefore)));
    }
  }

  throwIfAborted(signal);
  tracker.label("Writing README, manifest and viewers");
  for (const doc of input.buildDocuments([...files], failures)) {
    const bytes = await writer.add(doc.path, doc.content, { compress: true });
    files.push({ path: doc.path, bytes, kind: "document" });
  }
  tracker.complete();
  return { files, failures, notices: [...backend.notices], elapsedMs: tracker.elapsed() };
}
