import { Archive, FileSpreadsheet } from "lucide-react";
import { RenderJobDownloads, RenderJobProgress, RenderJobStatusBadge } from "@/features/render";
import { Button, buttonVariants } from "@/components/ui/button";
import { archivePartUrl, batchManifestUrl, type IngestBatch } from "@/lib/api/ingest";
import { cn } from "@/lib/utils";
import { manifestLinksNote, partOutputs, partsSummary, retentionNotes } from "../domain/results";
import { isArchiveBuilding, isBatchFinished } from "../domain/statuses";

type BatchResultsProps = {
  batch: IngestBatch;
  /** The `bulk_pipeline` and `upload` flags both on, as building an archive needs. */
  canBuild: boolean;
  /** The request that starts one is on its way. */
  starting: boolean;
  onBuild: () => void;
};

function buildLabel(starting: boolean, hasParts: boolean): string {
  if (starting) return "Starting…";
  return hasParts ? "Build the ZIP again" : "Build a ZIP of every file";
}

/** The newest job that builds the batch's ZIP, with its status and progress, and a download for each part. */
function ArchiveRow({ batch }: { batch: IngestBatch }) {
  const job = batch.archive?.job ?? null;
  const parts = batch.archive?.parts ?? [];
  if (!job && parts.length === 0) return null;
  const stopped = job?.status === "failed" || job?.status === "canceled";
  return (
    <div className="rounded-lg border border-border/50 bg-background/50 px-2.5 py-2" aria-label="Archive">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          ZIP{parts.length > 0 ? ` · ${partsSummary(parts)}` : ""}
        </p>
        {job ? <RenderJobStatusBadge job={job} className="shrink-0" /> : null}
      </div>
      {job?.status === "running" ? <RenderJobProgress progress={job.progress} className="mt-2" /> : null}
      {stopped ? <p className="mt-1.5 text-xs text-destructive">{job?.error ?? "The ZIP wasn't built."}</p> : null}
      {parts.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <RenderJobDownloads job={{ id: job?.id ?? 0, outputs: partOutputs(parts) }} hrefOf={(output) => archivePartUrl(batch.id, output.id)} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * A batch's results on its page (ADR 0006, "Results"): the manifest to download, with whom its
 * links open for; the ZIP of every file, built on our servers once the batch has finished, with
 * its job's status and progress (the shared job parts) and a download for each part; and how
 * long the batch keeps them.
 */
export function BatchResults({ batch, canBuild, starting, onBuild }: BatchResultsProps) {
  const finished = isBatchFinished(batch);
  const hasParts = (batch.archive?.parts.length ?? 0) > 0;
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-card/60 p-4" aria-label="Results">
      <div>
        <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Results</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The manifest lists every design with its status, embed link and a link to each file it made. {manifestLinksNote(batch)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={batchManifestUrl(batch.id)} download className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <FileSpreadsheet aria-hidden />
          Download the manifest (CSV)
        </a>
        {canBuild && finished ? (
          <Button type="button" size="sm" variant="outline" disabled={isArchiveBuilding(batch) || starting} onClick={onBuild}>
            <Archive aria-hidden />
            {buildLabel(starting, hasParts)}
          </Button>
        ) : null}
      </div>
      {!finished ? <p className="text-xs text-muted-foreground">A ZIP of every file can be built once the batch has finished.</p> : null}
      <ArchiveRow batch={batch} />
      {retentionNotes(batch).map((note) => (
        <p key={note} className="text-xs text-muted-foreground">
          {note}
        </p>
      ))}
    </section>
  );
}
