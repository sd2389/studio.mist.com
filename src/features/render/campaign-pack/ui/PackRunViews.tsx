"use client";

import { AlertTriangle, CheckCircle2, Download, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PackProgress, PackRunResult } from "../engine/runner";
import { formatBytes, formatDuration } from "./pack-ui";
import { triggerDownload } from "./useCampaignPackRun";

export function PackProgressView({ progress, onCancel }: { progress: PackProgress; onCancel: () => void }) {
  const percent = Math.floor(progress.fraction * 100);
  return (
    <div className="space-y-5 py-2" aria-live="polite">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Rendering</p>
          <p className="mt-1 truncate text-sm text-foreground" role="status">
            {progress.label || "Preparing renderer"}
          </p>
        </div>
        <p className="text-4xl font-semibold tabular-nums text-foreground">{percent}%</p>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Campaign pack progress"
      >
        <div className="h-full rounded-full bg-foreground transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Stat label="Files" value={String(progress.filesWritten)} />
        <Stat label="Failed" value={String(progress.failures)} tone={progress.failures > 0 ? "warn" : undefined} />
        <Stat label="Elapsed" value={formatDuration(progress.elapsedMs)} />
        <Stat label="Remaining" value={progress.etaMs === null ? "estimating…" : `~${formatDuration(progress.etaMs)}`} />
      </dl>
      <p className="text-[11px] text-muted-foreground">
        Everything renders on your GPU. Keep this tab in front — browsers slow down background tabs.
      </p>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onCancel} className="gap-2">
          <X className="size-4" aria-hidden />
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={tone === "warn" ? "font-medium text-amber-700 dark:text-amber-400" : "font-medium text-foreground"}>{value}</dd>
    </div>
  );
}

export function PackSummaryView({
  result,
  url,
  onAgain,
  onClose,
}: {
  result: PackRunResult;
  url: string;
  onAgain: () => void;
  onClose: () => void;
}) {
  const clean = result.failures.length === 0;
  const count = (kind: string) => result.files.filter((file) => file.kind === kind).length;
  const stills = count("still-jpg") + count("still-png");
  return (
    <div className="space-y-4 py-1">
      <div className="flex items-start gap-3">
        {clean ? (
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-600" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 size-6 shrink-0 text-amber-600" aria-hidden />
        )}
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground">
            {clean ? "Campaign pack ready" : `Pack ready — ${result.failures.length} item${result.failures.length > 1 ? "s" : ""} skipped`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {result.zipName} · {formatBytes(result.zip.size)} · {result.files.length} files · {formatDuration(result.elapsedMs)}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-xs">
        <Stat label="Stills" value={String(stills)} />
        <Stat label="Videos" value={String(count("video"))} />
        <Stat label="Spin frames" value={String(count("spin-frame"))} />
      </dl>
      {result.failures.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300" role="alert">
          <p className="mb-1 font-semibold">Not included</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {result.failures.map((failure) => (
              <li key={failure.jobId}>
                <span className="font-medium">{failure.label}</span> — {failure.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.notices.map((notice) => (
        <p key={notice} className="text-xs text-muted-foreground">
          {notice}
        </p>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onAgain} className="gap-2">
          <RotateCcw className="size-4" aria-hidden />
          New pack
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button type="button" onClick={() => triggerDownload(url, result.zipName)} className="gap-2">
          <Download className="size-4" aria-hidden />
          Download again
        </Button>
      </div>
    </div>
  );
}

export function PackMessageView({
  tone,
  message,
  onBack,
}: {
  tone: "error" | "cancelled";
  message: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 py-2">
      <p className={tone === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"} role={tone === "error" ? "alert" : "status"}>
        {message}
      </p>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2">
          <RotateCcw className="size-4" aria-hidden />
          Back to settings
        </Button>
      </div>
    </div>
  );
}
