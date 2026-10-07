"use client";

import { Loader2, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipField } from "@/components/ui/chip";
import { cn } from "@/lib/utils";
import { JOB_STATUS_LABELS, jobAge, jobCreditsLabel, jobSummary, jobTitle } from "../lib/render-job-labels";
import { isJobFinished } from "../lib/render-job-polling";
import { jobRetryRequest } from "../lib/render-job-requests";
import {
  cancelRenderJob,
  createRenderJob,
  outputDownloadUrl,
  type RenderJob,
  type RenderJobRequest,
  type RenderJobStatus,
} from "../lib/render-jobs-api";
import { RenderJobDownloads, RenderJobProgress, RenderJobStatusBadge } from "./RenderJobParts";
import { useRenderJob } from "./useRenderJob";
import { useRenderJobList } from "./useRenderJobList";

type StatusFilter = RenderJobStatus | "all";

const STATUS_FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...(Object.entries(JOB_STATUS_LABELS) as [RenderJobStatus, string][]).map(([value, label]) => ({ value, label })),
];

type ExportJobsPanelProps = {
  /** One scene's jobs; every job, with a status filter, when left out (the Exports page). */
  sceneId?: number;
  /** Jobs the page around it just started, such as a Quick still: listed first and downloaded once ready. */
  started?: RenderJob[];
  className?: string;
};

/**
 * Server exports, newest first: each with its status, progress, credits and a download for
 * every file it made. Jobs still waiting or rendering keep themselves up to date and can be
 * canceled; a canceled job's credits come back. A failed job can be asked for again. Jobs
 * started from here or the page around it are listed first, and downloaded once they are ready.
 */
export function ExportJobsPanel({ sceneId, started = [], className }: ExportJobsPanelProps) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [retried, setRetried] = useState<RenderJob[]>([]);
  const list = useRenderJobList({ scene_id: sceneId, status: status === "all" ? undefined : status });
  const fresh = [...retried, ...started];
  const freshIds = new Set(fresh.map((job) => job.id));
  const jobs = [...fresh, ...list.jobs.filter((job) => !freshIds.has(job.id))];
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
            <ExportJobRow
              key={job.id}
              initial={job}
              autoDownload={freshIds.has(job.id)}
              onRetried={(next) => setRetried((shown) => [next, ...shown])}
            />
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

/**
 * The jobs a dialog or button started, each followed until it ends and its files downloaded
 * once it is ready, while it is on screen. They are in the Exports panel too.
 */
export function StartedExportJobs({ jobs, onRetried }: { jobs: RenderJob[]; onRetried: (job: RenderJob) => void }) {
  if (jobs.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Started exports">
      {jobs.map((job) => (
        <ExportJobRow key={job.id} initial={job} autoDownload onRetried={onRetried} />
      ))}
    </ul>
  );
}

/** Saves each of a job's files, as its Download buttons would. */
function saveJobOutputs(job: RenderJob) {
  for (const output of job.outputs) {
    const link = document.createElement("a");
    link.href = outputDownloadUrl(job.id, output.id);
    if (output.filename) link.download = output.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

type ExportJobRowProps = {
  initial: RenderJob;
  /** Save its files once it is ready: a job this page started. */
  autoDownload?: boolean;
  /** The job a failed one's Retry made. */
  onRetried: (job: RenderJob) => void;
};

/** One job, polled while it waits or renders. */
function ExportJobRow({ initial, autoDownload = false, onRetried }: ExportJobRowProps) {
  const { job, error, setJob } = useRenderJob(initial);
  const savedJob = useRef<number | null>(null);
  const [pending, setPending] = useState<"cancel" | "retry" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const cancelable = !isJobFinished(job) && !job.cancel_requested_at;
  const retryRequest = job.status === "failed" ? jobRetryRequest(job) : null;
  const rowError = actionError ?? error;
  const title = jobTitle(job);
  const meta = [jobCreditsLabel(job), jobAge(job)].filter(Boolean).join(" · ");

  // Once, when the job it follows is ready; not again for a re-render, nor for a list's older jobs.
  useEffect(() => {
    if (!autoDownload || job.status !== "completed" || savedJob.current === job.id) return;
    savedJob.current = job.id;
    saveJobOutputs(job);
  }, [autoDownload, job]);

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
        <RenderJobStatusBadge job={job} className="shrink-0" />
      </div>

      {job.status === "running" ? <RenderJobProgress progress={job.progress} className="mt-3" /> : null}
      {job.status === "failed" ? (
        <p className="mt-2 text-xs text-destructive">{job.error ?? "The render failed."}</p>
      ) : null}
      {rowError ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {rowError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {job.status === "completed" ? <RenderJobDownloads job={job} /> : null}
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
