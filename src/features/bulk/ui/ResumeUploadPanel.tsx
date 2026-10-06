"use client";

import { useState } from "react";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { listAllBatchItems, type IngestBatch } from "@/lib/api/ingest";
import type { DroppedFile } from "@/lib/upload/dropped-files";
import { resumeUploads } from "../domain/resume-uploads";
import { countOf } from "../domain/statuses";
import { expandZips } from "../lib/expand-zips";
import { panelLabel } from "./BatchPlanPanel";
import { BULK_FILE_ACCEPT } from "./BulkDropPanel";
import { UploadProgress } from "./UploadProgress";
import { useBatchUploads } from "./useBatchUploads";

type ResumeUploadPanelProps = {
  batch: IngestBatch;
  /** The uploads from here ended: the batch's page loads it again. */
  onUploaded: () => void;
};

/**
 * Finishes a batch's uploads after its page was left: the same files dropped again, matched to
 * the designs still awaiting theirs by path and size, upload as they did the first time.
 */
export function ResumeUploadPanel({ batch, onUploaded }: ResumeUploadPanelProps) {
  const uploads = useBatchUploads();
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const waiting = countOf(batch, "awaiting_upload");

  async function resume(dropped: DroppedFile[]) {
    setReading(true);
    setNote(null);
    try {
      const [expanded, items] = await Promise.all([expandZips(dropped), listAllBatchItems(batch.id, "awaiting_upload")]);
      const { uploads: found, missing } = resumeUploads(items, expanded.files);
      if (found.length === 0) {
        setNote(`None of the ${items.length} designs waiting is in what was dropped, at the size it had.`);
        return;
      }
      if (missing.length > 0) setNote(`${missing.length} of the designs waiting aren't in what was dropped: drop them too.`);
      setReading(false);
      await uploads.start(batch.id, found);
      onUploaded();
    } catch (failure) {
      setNote(failure instanceof Error ? failure.message : "The files couldn't be uploaded");
    } finally {
      setReading(false);
    }
  }

  const failures = [...uploads.states.values()].filter((state) => state.status === "failed" && state.message);
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-card/60 p-4" aria-label="Uploads to finish">
      <p className={panelLabel}>Uploads to finish</p>
      <p className="text-xs text-muted-foreground">
        {waiting === 1 ? "1 design is" : `${waiting} designs are`} waiting for {waiting === 1 ? "its file" : "their files"}.
        Drop the same files, folder or ZIP again: only the designs still waiting go up.
      </p>
      <FileDropZone
        title="Drop the files again"
        accept={BULK_FILE_ACCEPT}
        folders
        busy={reading || uploads.running}
        onFiles={(files) => void resume(files)}
        className="py-6"
      />
      {uploads.states.size > 0 ? <UploadProgress totals={uploads.totals} /> : null}
      {failures.length > 0 ? (
        <ul className="space-y-1 text-xs text-destructive">
          {failures.slice(0, 10).map((state) => (
            <li key={state.path}>
              {state.path}: {state.message}
            </li>
          ))}
          {failures.length > 10 ? <li>and {failures.length - 10} more</li> : null}
        </ul>
      ) : null}
      {note ? (
        <p className="text-xs text-muted-foreground" role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}
