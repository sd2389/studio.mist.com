import { formatRelativeTime } from "@/lib/relative-time";
import type { RenderJob, RenderJobStatus } from "./render-jobs-api";

export const JOB_STATUS_LABELS: Record<RenderJobStatus, string> = {
  queued: "Queued",
  running: "Rendering",
  completed: "Ready",
  failed: "Failed",
  canceled: "Canceled",
};

const JOB_KIND_LABELS: Record<string, string> = {
  still: "Still",
  angle_set: "Angle set",
  turntable: "Turntable",
  spin: "Spin",
  campaign_pack: "Campaign Pack",
  convert: "Conversion",
  batch_archive: "Archive",
};

const JOB_STAGE_LABELS: Record<string, string> = {
  loading: "Loading",
  rendering: "Rendering",
  encoding: "Encoding",
  uploading: "Uploading",
};

type LabelledJob = Pick<RenderJob, "id" | "kind" | "status" | "stage" | "cancel_requested_at" | "spec" | "watermark">;

/** What the files of a kind's jobs are, one and several. */
const OUTPUT_NOUNS: Record<string, readonly [one: string, several: string]> = {
  still: ["image", "images"],
  angle_set: ["image", "images"],
  turntable: ["video", "videos"],
};

/** "1 credit", "4 credits". */
export function creditsLabel(credits: number): string {
  return `${credits} ${credits === 1 ? "credit" : "credits"}`;
}

/** "1 image", "3 videos": `count` files of a `kind` job; "files" for kinds that make other things. */
export function outputsLabel(kind: string, count: number): string {
  const [one, several] = OUTPUT_NOUNS[kind] ?? ["file", "files"];
  return `${count} ${count === 1 ? one : several}`;
}

/** What the job is doing now: "Queued", "Encoding", "Canceling", "Ready". */
export function jobStatusLabel(job: Pick<RenderJob, "status" | "stage" | "cancel_requested_at">): string {
  if (job.status !== "running") return JOB_STATUS_LABELS[job.status] ?? job.status;
  if (job.cancel_requested_at) return "Canceling";
  return JOB_STAGE_LABELS[job.stage ?? ""] ?? JOB_STATUS_LABELS.running;
}

function specNumber(spec: Record<string, unknown>, key: string): number | null {
  const value = spec[key];
  return typeof value === "number" ? value : null;
}

/**
 * The file names the job makes, as the API named them when it took the job: `output_names`.
 * A2's migration (12a67b9ab68f) renames `outputs` to that in every stored row, so `outputs` only
 * comes from an API older than A2, or one rolled back past it.
 */
function specOutputs(spec: Record<string, unknown>): string[] {
  const names = spec.output_names ?? spec.outputs;
  return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : [];
}

/** "solitaire-4K.png", or "solitaire-front.png + 3 more"; the kind for jobs that name no file. */
export function jobTitle(job: LabelledJob): string {
  const [first, ...rest] = specOutputs(job.spec);
  if (!first) return `${JOB_KIND_LABELS[job.kind] ?? job.kind} #${job.id}`;
  return rest.length > 0 ? `${first} + ${rest.length} more` : first;
}

/** "Still · 3840 × 2160 · PNG cutout · watermarked". */
export function jobSummary(job: LabelledJob): string {
  const width = specNumber(job.spec, "width");
  const height = specNumber(job.spec, "height");
  const files = specOutputs(job.spec).length;
  const format = typeof job.spec.format === "string" ? job.spec.format.toUpperCase() : null;
  return [
    JOB_KIND_LABELS[job.kind] ?? job.kind,
    files > 1 ? `${files} files` : null,
    width && height ? `${width} × ${height}` : null,
    format && job.spec.transparent === true ? `${format} cutout` : format,
    job.watermark ? "watermarked" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "2 credits held" while it renders, "2 credits" once charged; null for a job that costs nothing. */
export function jobCreditsLabel(job: Pick<RenderJob, "credits" | "credit_state">): string | null {
  if (job.credits <= 0) return null;
  if (job.credit_state === "held") return `${creditsLabel(job.credits)} held`;
  if (job.credit_state === "refunded") return `${creditsLabel(job.credits)} refunded`;
  return creditsLabel(job.credits);
}

/** "3 minutes ago", read as UTC whether the time ends in Z (as the API sends it) or not. */
export function jobAge(job: Pick<RenderJob, "created_at">): string {
  return formatRelativeTime(job.created_at);
}
