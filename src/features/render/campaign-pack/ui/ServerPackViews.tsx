"use client";

import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import { UpgradeButton } from "@/components/billing/UpgradePrompt";
import { Button } from "@/components/ui/button";
import type { RenderJob } from "../../lib/render-jobs-api";
import { StartedExportJobs } from "../../ui/ExportJobsPanel";
import { RenderJobCost, RenderJobError } from "../../ui/RenderJobCost";
import type { useRenderJobQuote } from "../../ui/useRenderJobQuote";

type ServerPackFooterProps = {
  /** What the pack makes, or why it can't be started. */
  summary: string;
  quote: ReturnType<typeof useRenderJobQuote> | null;
  /** The plan has no packs: an upgrade in place of Render. */
  locked: boolean;
  canStart: boolean;
  starting: boolean;
  error: Error | null;
  onStart: () => void;
};

/** The settings' footer for a pack on the server: what it makes, what it costs, and Render. */
export function ServerPackFooter({ summary, quote, locked, canStart, starting, error, onStart }: ServerPackFooterProps) {
  return (
    // Sticky offsets are inset by the dialog's p-4; -bottom-4 pins it to the edge.
    <div className="sticky -bottom-4 -mx-4 -mb-4 space-y-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-muted-foreground" role="status">
            {summary}
          </p>
          {quote ? <RenderJobCost {...quote} /> : null}
        </div>
        {locked ? (
          <UpgradeButton className="gap-2">
            <Sparkles className="size-4" aria-hidden />
            Upgrade to render
          </UpgradeButton>
        ) : (
          <Button type="button" onClick={onStart} disabled={!canStart || starting} className="gap-2">
            {starting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {starting ? "Starting…" : "Render campaign pack"}
          </Button>
        )}
      </div>
      <RenderJobError error={error} />
    </div>
  );
}

type ServerPackJobsProps = {
  jobs: RenderJob[];
  onRetried: (job: RenderJob) => void;
  /** Back to the settings for another pack; the one started renders on. */
  onAgain: () => void;
  onClose: () => void;
};

/** The pack started from here: its progress, then its ZIP, downloaded once it is ready while this is open. */
export function ServerPackJobs({ jobs, onRetried, onAgain, onClose }: ServerPackJobsProps) {
  return (
    <div className="space-y-4 py-1">
      <StartedExportJobs jobs={jobs} onRetried={onRetried} />
      <p className="text-[11px] text-muted-foreground">
        The pack renders on our servers, so you can close this window: it stays under Exports, ready to download.
        Left open, this window downloads it when it&apos;s done.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onAgain} className="gap-2">
          <RotateCcw className="size-4" aria-hidden />
          New pack
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
