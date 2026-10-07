import {
  creditsLabel,
  jobKindLabel,
  outputsLabel,
  RenderJobDownloads,
  RenderJobProgress,
  RenderJobStatusBadge,
} from "@/features/render";
import type { IngestItemJob } from "@/lib/api/ingest";

/** "Angle set · 4 images · 4 credits", "Turntable · try 2 of 3". */
function jobLine(job: IngestItemJob): string {
  const parts = [jobKindLabel(job.kind)];
  if (job.outputs.length > 0) parts.push(outputsLabel(job.kind, job.outputs.length));
  if (job.status !== "completed" && job.attempts > 1) parts.push(`try ${job.attempts} of ${job.max_attempts}`);
  if (job.credits > 0) parts.push(creditsLabel(job.credits) + (job.credit_state === "refunded" ? " refunded" : ""));
  return parts.join(" · ");
}

/**
 * A design's renders on its batch's page: each job its plan made, with its status, its progress
 * while it renders, why it stopped, and a download for every file once it is made.
 */
export function DesignRenders({ jobs }: { jobs: IngestItemJob[] }) {
  if (jobs.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1.5" aria-label="Renders">
      {jobs.map((job) => (
        <li key={job.id} className="rounded-lg border border-border/50 bg-background/50 px-2.5 py-2">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {jobLine(job)}
            </p>
            <RenderJobStatusBadge job={job} className="shrink-0" />
          </div>
          {job.status === "running" ? <RenderJobProgress progress={job.progress} className="mt-2" /> : null}
          {job.status === "failed" || job.status === "canceled" ? (
            <p className="mt-1.5 text-xs text-destructive">{job.error ?? "The render didn't finish."}</p>
          ) : null}
          {job.status === "completed" && job.outputs.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <RenderJobDownloads job={job} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
