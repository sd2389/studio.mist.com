"use client";

import { Download, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { RenderJobRequest } from "../lib/render-jobs-api";
import { StartedExportJobs } from "./ExportJobsPanel";
import { RenderJobCost, RenderJobError } from "./RenderJobCost";
import { useRenderJobQuote } from "./useRenderJobQuote";
import { useStartedRenderJobs } from "./useStartedRenderJobs";

type RenderJobButtonProps = {
  /**
   * The jobs to start, built for the price as the button draws and again for the click, so they
   * take the camera as it is when the user clicks. Null while there is nothing to render.
   */
  requests: () => RenderJobRequest[] | null;
  /** Start them in one bulk request, all or none (the "Multiple" modes). */
  bulk?: boolean;
  disabled?: boolean;
  /** The button's label. */
  children: ReactNode;
};

/**
 * A server export's Render button (ADR 0005): the credits it will cost beside it, then each job
 * it started with its progress, and its files, downloaded once they are ready. Nothing is
 * rendered in the browser.
 */
export function RenderJobButton({ requests, bulk = false, disabled = false, children }: RenderJobButtonProps) {
  const priced = requests();
  const quote = useRenderJobQuote(priced && (bulk ? priced : (priced[0] ?? null)));
  const started = useStartedRenderJobs();

  function start() {
    const next = requests();
    if (!next?.length) return;
    void (bulk ? started.startJobs(next) : started.startJob(next[0]!));
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        className="w-full gap-2"
        disabled={disabled || !priced?.length || started.starting}
        onClick={start}
      >
        {started.starting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Starting…
          </>
        ) : (
          <>
            <Download className="size-4" aria-hidden />
            {children}
          </>
        )}
      </Button>
      <RenderJobCost {...quote} kind={priced?.[0]?.kind} />
      <RenderJobError error={started.error} />
      <StartedExportJobs jobs={started.jobs} onRetried={started.add} />
    </div>
  );
}
