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
import { PackZipWriter } from "../domain/zip-writer";
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

export type PackRunResult = {
  zip: Blob;
  zipName: string;
  files: PackFileRecord[];
  failures: PackFailure[];
  notices: string[];
  elapsedMs: number;
};

export type RunCampaignPackInput = {
  plan: PackPlan;
  backend: PackRenderBackend;
  buildDocuments: (files: PackFileRecord[], failures: PackFailure[]) => PackDocument[];
  signal?: AbortSignal;
  onProgress?: (progress: PackProgress) => void;
  now?: () => number;
  modifiedAt?: Date;
};

const ETA_MIN_FRACTION = 0.02;
const ETA_MIN_ELAPSED_MS = 1500;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "AbortError";
}

function createTracker(input: RunCampaignPackInput, writer: PackZipWriter, failures: PackFailure[]) {
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
      filesWritten: writer.files.length,
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
  writer: PackZipWriter;
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
  const blob = await ctx.backend.renderTurntable(
    job,
    (index) => ctx.tracker.advance(job.units / job.frameCount, `${job.label} · frame ${index + 1}/${job.frameCount}`),
    ctx.signal,
  );
  const record = { path: job.path, kind: "video" as const, metal: ctx.metalSlug(job.metal), width: job.width, height: job.height };
  await writeFile(ctx, record, blob);
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
 * Renders every planned job, keeps going past failures (each is reported), streams
 * outputs into one ZIP, then appends the generated documents. Aborting rejects with an
 * AbortError and produces nothing.
 */
export async function runCampaignPack(input: RunCampaignPackInput): Promise<PackRunResult> {
  const { plan, backend, signal } = input;
  const writer = new PackZipWriter(input.modifiedAt);
  const files: PackFileRecord[] = [];
  const failures: PackFailure[] = [];
  const tracker = createTracker(input, writer, failures);
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
  const zip = writer.finish();
  tracker.complete();
  return {
    zip,
    zipName: plan.zipName,
    files,
    failures,
    notices: [...backend.notices],
    elapsedMs: tracker.elapsed(),
  };
}
