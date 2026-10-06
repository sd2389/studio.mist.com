"use client";

import Link from "next/link";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { Button } from "@/components/ui/button";
import { UploadProgress } from "./UploadProgress";
import type { BulkUploadFlow } from "./useBulkUploadFlow";

const primaryAction =
  "w-full rounded-full bg-foreground py-6 font-mono text-[10px] uppercase tracking-[0.24em] text-background hover:bg-foreground";

type BulkUploadActionsProps = {
  flow: BulkUploadFlow;
  designCount: number;
  /** Why the batch can't be made yet, or null when it can. */
  blocked: string | null;
};

/**
 * The upload page's next step: make and upload the batch, follow its uploads, try failed ones
 * again or submit without them, and say plainly why it can't go on (an upgrade for a 402 or 429).
 */
export function BulkUploadActions({ flow, designCount, blocked }: BulkUploadActionsProps) {
  const { phase, batch } = flow;
  const busy = phase === "creating" || phase === "uploading" || phase === "submitting";
  const left = flow.uploads.totals.designs - flow.uploads.totals.confirmed;

  return (
    <div className="space-y-3">
      {batch ? <UploadProgress totals={flow.uploads.totals} /> : null}

      {phase === "planning" || phase === "creating" ? (
        <>
          <Button type="button" className={primaryAction} disabled={blocked !== null || busy} onClick={flow.start}>
            {phase === "creating" ? "Making the batch…" : `Upload ${designCount} design${designCount === 1 ? "" : "s"}`}
          </Button>
          {blocked ? <p className="text-xs text-muted-foreground">{blocked}</p> : null}
        </>
      ) : null}

      {phase === "uploading" ? (
        <p className="text-xs text-muted-foreground">
          Uploading straight to storage, four files at a time. Keep this page open: leaving it pauses the batch,
          and its page takes the files again.
        </p>
      ) : null}
      {phase === "submitting" ? <p className="text-xs text-muted-foreground">Submitting the batch…</p> : null}

      {phase === "uploaded" && batch ? (
        <div className="flex flex-col gap-2">
          {left > 0 ? (
            <Button type="button" variant="outline" onClick={flow.retryUploads}>
              Upload the {left} left
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={flow.submit}>
            {left > 0 ? "Submit without them" : "Submit the batch"}
          </Button>
          <Link href={`/bulk/${batch.id}`} className="text-center text-xs text-primary hover:underline">
            Open the batch&apos;s page
          </Link>
        </div>
      ) : null}

      {flow.refusal ? <UpgradePrompt className="text-destructive">{flow.refusal.message}</UpgradePrompt> : null}
      {flow.error ? (
        <p className="text-xs text-destructive" role="alert">
          {flow.error}
        </p>
      ) : null}
    </div>
  );
}
