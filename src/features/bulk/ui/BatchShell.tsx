"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import type { BatchView } from "@/lib/api/ingest";
import { formatStorageGb } from "@/lib/billing/format";
import { formatRelativeTime } from "@/lib/relative-time";
import { canRetryFailed, countOf, finishedCount, isBatchOpen, PIPELINE_NOTE } from "../domain/statuses";
import { BatchStatusBadge } from "./BatchBadges";
import { BatchCounts } from "./BatchCounts";
import { BatchItemList } from "./BatchItemList";
import { CancelBatchDialog } from "./CancelBatchDialog";
import { ResumeUploadPanel } from "./ResumeUploadPanel";
import { useBatchView, type BatchViewState } from "./useBatchView";

type BatchShellProps = {
  initial: BatchView;
  /** The `bulk_pipeline` flag: off, a batch can only be read and canceled, as in the API. */
  bulkEnabled: boolean;
  userEmail?: string | null;
  isAdmin?: boolean;
};

function BatchActions({ state, bulkEnabled }: { state: BatchViewState; bulkEnabled: boolean }) {
  const { batch } = state.view;
  const failed = countOf(batch, "failed");
  const actions = [];
  if (bulkEnabled && batch.status === "draft") {
    actions.push(
      <Button key="submit" type="button" disabled={state.pending !== null} onClick={() => void state.submit()}>
        {state.pending === "submit" ? "Submitting…" : "Submit the batch"}
      </Button>,
    );
  }
  if (bulkEnabled && canRetryFailed(batch)) {
    actions.push(
      <Button key="retry" type="button" variant="outline" disabled={state.pending !== null} onClick={() => void state.retryFailed()}>
        <RotateCcw aria-hidden />
        {state.pending === "retry-failed" ? "Retrying…" : `Retry the ${failed === 1 ? "failed design" : `${failed} failed`}`}
      </Button>,
    );
  }
  if (isBatchOpen(batch)) {
    actions.push(
      <CancelBatchDialog
        key="cancel"
        batchName={batch.name}
        unfinished={batch.item_count - finishedCount(batch)}
        canceling={state.pending === "cancel"}
        onConfirm={() => void state.cancel()}
      />,
    );
  }
  return (
    <div className="space-y-2">
      {actions.length > 0 ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      {batch.status === "draft" ? (
        <p className="text-xs text-muted-foreground">
          A draft holds no credits. Submitting holds a model credit a design and starts converting the uploaded ones;
          the rest convert as their uploads finish.
        </p>
      ) : null}
      {state.refused.length > 0 ? (
        <p className="text-xs text-destructive">
          {state.refused.length === 1 ? "1 design" : `${state.refused.length} designs`} couldn&apos;t be retried: see below.
        </p>
      ) : null}
      {state.refusal ? <UpgradePrompt className="text-destructive">{state.refusal.message}</UpgradePrompt> : null}
      {state.actionError ? (
        <p className="text-xs text-destructive" role="alert">
          {state.actionError}
        </p>
      ) : null}
    </div>
  );
}

/**
 * `/bulk/<id>`: a batch's designs counted by status and listed 50 a page, filtered by status,
 * each with why it stopped; retry what failed, cancel what hasn't finished, and finish the
 * uploads a left page paused. Followed while it processes.
 */
export function BatchShell({ initial, bulkEnabled, userEmail, isAdmin }: BatchShellProps) {
  const state = useBatchView(initial);
  const { batch, items } = state.view;
  const waiting = countOf(batch, "awaiting_upload");
  const stalled = countOf(batch, "converting") + countOf(batch, "converted") > 0;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader userEmail={userEmail} showAdminLink={isAdmin} />
      <main className="p-3">
        <section className="ice-panel mx-auto min-w-0 max-w-4xl overflow-hidden p-5 sm:p-8">
          <header className="flex flex-col gap-6 border-b border-foreground/10 pb-8 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/45">
                {bulkEnabled ? (
                  <Link href="/bulk/new" className="transition-colors hover:text-foreground">
                    Workshop / Bulk upload
                  </Link>
                ) : (
                  "Workshop / Bulk upload"
                )}
              </p>
              <h1 className="mt-7 break-words text-[clamp(2.4rem,5vw,4.5rem)] font-light leading-[0.9] tracking-[-0.07em]">
                {batch.name}
              </h1>
              <p className="mt-4 text-xs text-muted-foreground">
                {batch.item_count} design{batch.item_count === 1 ? "" : "s"} · {formatStorageGb(batch.total_bytes)} · made{" "}
                {formatRelativeTime(batch.created_at)}
              </p>
            </div>
            <BatchStatusBadge status={batch.status} className="self-start sm:self-auto" />
          </header>

          <div className="mt-6 space-y-6">
            {!bulkEnabled ? (
              <p className="rounded-xl border border-border/60 bg-card/60 p-3 text-xs text-muted-foreground" role="status">
                Bulk uploads are switched off for now. This batch can still be followed, and canceled for its credits.
              </p>
            ) : null}
            <BatchCounts batch={batch} />
            {stalled ? (
              <p className="rounded-xl border border-border/60 bg-card/60 p-3 text-xs text-muted-foreground" role="status">
                {PIPELINE_NOTE}
              </p>
            ) : null}
            <BatchActions state={state} bulkEnabled={bulkEnabled} />
            {state.pollError ? (
              <p className="text-xs text-destructive" role="alert">
                {state.pollError}{" "}
                <button type="button" className="font-medium underline underline-offset-4" onClick={state.refresh}>
                  Try again
                </button>
              </p>
            ) : null}
            {bulkEnabled && isBatchOpen(batch) && waiting > 0 ? (
              <ResumeUploadPanel batch={batch} onUploaded={state.refresh} />
            ) : null}
            <BatchItemList
              batch={batch}
              items={items}
              query={state.query}
              onStatus={state.showStatus}
              onPage={state.showPage}
              onRetry={bulkEnabled && canRetryFailed(batch) ? (itemId) => void state.retryItem(itemId) : undefined}
              pending={state.pending}
              refused={state.refused}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
