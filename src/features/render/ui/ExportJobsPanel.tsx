"use client";

import { Download, Loader2, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChipField } from "@/components/ui/chip";
import { Progress } from "@/components/ui/progress";
import { formatStorageGb } from "@/lib/billing/format";
import { cn } from "@/lib/utils";
import {
  JOB_STATUS_LABELS,
  jobAge,
  jobCreditsLabel,
  jobStatusLabel,
  jobSummary,
  jobTitle,
} from "../lib/render-job-labels";
import { isJobFinished } from "../lib/render-job-polling";
import { jobRetryRequest } from "../lib/render-job-requests";
import {
  cancelRenderJob,
  createRenderJob,
  outputDownloadUrl,
  type RenderJob,
  type RenderJobOutput,
  type RenderJobRequest,
  type RenderJobStatus,
} from "../lib/render-jobs-api";
import { useRenderJob } from "./useRenderJob";
import { useRenderJobList } from "./useRenderJobList";

type StatusFilter = RenderJobStatus | "all";

const STATUS_FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...(Object.entries(JOB_STATUS_LABELS) as [RenderJobStatus, string][]).map(([value, label]) => ({ value, label })),
];

const STATUS_BADGES: Record<RenderJobStatus, "default" | "secondary" | "outline" | "destructive"> = {
  queued: "outline",
  running: "secondary",
  completed: "default",
  failed: "destructive",
  canceled: "outline",
};

type ExportJobsPanelProps = {
  /** One scene's jobs; every job, with a status filter, when left out (the Exports page). */
  sceneId?: number;
  className?: string;
};

/**
 * Server exports, newest first: each with its status, progress, credits and a download for
 * every file it made. Jobs still waiting or rendering keep themselves up to date and can be
 * canceled; a canceled job's credits come back. A failed job can be asked for again, and the
 * new job is listed first.
 */
export function ExportJobsPanel({ sceneId, className }: ExportJobsPanelProps) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [retried, setRetried] = useState<RenderJob[]>([]);
  const list = useRenderJobList({ scene_id: sceneId, status: status === "all" ? undefined : status });
  const retriedIds = new Set(retried.map((job) => job.id));
  const jobs = [...retried, ...list.jobs.filter((job) => !retriedIds.has(job.id))];
  const emptyNote =
    status === "all"
      ? "No exports yet. Stills and videos you render show up here, ready to download."
      : `No ${JOB_STATUS_LABELS[status].toLowerCase()} exports.`;

  return (
    <section className={cn("space-y-4", className)} aria-label="Exports" aria-busy={list.loading}>
      {sceneId === undefined ? (
        <ChipField label="Show" options={STATUS_FILTERS} value={status} onChange={setStatus} />
      ) : null}

      {list.error ? (
        <p className="text-xs text-destructive" role="alert">
          {list.error}{" "}
          <button type="button" className="font-medium underline underline-offset-4" onClick={list.refresh}>
            Try again
          </button>
        </p>
      ) : null}

      {jobs.length > 0 ? (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <ExportJobRow key={job.id} initial={job} onRetried={(next) => setRetried((shown) => [next, ...shown])} />
          ))}
        </ul>
      ) : list.loading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Loading exports…
        </p>
      ) : list.error ? null : (
        <p className="text-xs text-muted-foreground">{emptyNote}</p>
      )}

      {list.hasMore ? (
        <Button variant="outline" size="sm" onClick={() => void list.loadMore()} disabled={list.loadingMore}>
          {list.loadingMore ? "Loading…" : "Show older exports"}
        </Button>
      ) : null}
    </section>
  );
}

type ExportJobRowProps = {
  initial: RenderJob;
  /** The job a failed one's Retry made. */
  onRetried: (job: RenderJob) => void;
};

/** One job, polled while it waits or renders. */
function ExportJobRow({ initial, onRetried }: ExportJobRowProps) {
  const { job, error, setJob } = useRenderJob(initial);
  const [pending, setPending] = useState<"cancel" | "retry" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const cancelable = !isJobFinished(job) && !job.cancel_requested_at;
  const retryRequest = job.status === "failed" ? jobRetryRequest(job) : null;
  const rowError = actionError ?? error;
  const title = jobTitle(job);
  const meta = [jobCreditsLabel(job), jobAge(job)].filter(Boolean).join(" · ");

  async function cancel() {
    setPending("cancel");
    setActionError(null);
    try {
      setJob(await cancelRenderJob(job.id));
    } catch (cancelFailure) {
      setActionError(cancelFailure instanceof Error ? cancelFailure.message : "The export couldn't be canceled");
    } finally {
      setPending(null);
    }
  }

  /** The same job again, with a fresh Idempotency-Key: a new job, with its own credits. */
  async function retry(request: RenderJobRequest) {
    setPending("retry");
    setActionError(null);
    try {
      onRetried(await createRenderJob(request));
    } catch (retryFailure) {
      setActionError(retryFailure instanceof Error ? retryFailure.message : "The export couldn't be started again");
    } finally {
      setPending(null);
    }
  }

  return (
    <li className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground" title={title}>
            {title}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {jobSummary(job)}
          </p>
        </div>
        <Badge variant={STATUS_BADGES[job.status] ?? "outline"} className="shrink-0">
          {jobStatusLabel(job)}
        </Badge>
      </div>

      {job.status === "running" ? <JobProgress progress={job.progress} /> : null}
      {job.status === "failed" ? (
        <p className="mt-2 text-xs text-destructive">{job.error ?? "The render failed."}</p>
      ) : null}
      {rowError ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {rowError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {job.status === "completed" ? <JobDownloads job={job} /> : null}
        {cancelable ? (
          <Button variant="outline" size="sm" onClick={() => void cancel()} disabled={pending !== null}>
            <X aria-hidden />
            {pending === "cancel" ? "Canceling…" : "Cancel"}
          </Button>
        ) : null}
        {retryRequest ? (
          <Button variant="outline" size="sm" onClick={() => void retry(retryRequest)} disabled={pending !== null}>
            <RotateCcw aria-hidden />
            {pending === "retry" ? "Retrying…" : "Retry"}
          </Button>
        ) : null}
        {meta ? <span className="ml-auto text-[10.5px] text-muted-foreground">{meta}</span> : null}
      </div>
    </li>
  );
}

function JobProgress({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="mt-3 flex items-center gap-3">
      <Progress value={percent} aria-label="Render progress" className="flex-1" />
      <span className="text-[10.5px] tabular-nums text-muted-foreground">{percent}%</span>
    </div>
  );
}

/** "Download · 18 MB" for a job's one file; each file by its label when it made several. */
function JobDownloads({ job }: { job: RenderJob }) {
  const several = job.outputs.length > 1;
  return job.outputs.map((output: RenderJobOutput, index) => (
    <a
      key={output.id}
      href={outputDownloadUrl(job.id, output.id)}
      download={output.filename ?? undefined}
      title={output.filename ?? undefined}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      <Download aria-hidden />
      {several ? (output.label ?? output.filename ?? `File ${index + 1}`) : "Download"}
      <span className="font-normal text-muted-foreground">· {formatStorageGb(output.bytes)}</span>
    </a>
  ));
}
