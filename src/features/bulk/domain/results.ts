import type { RenderJobOutput } from "@/features/render";
import type { IngestArchivePart, IngestBatch } from "@/lib/api/ingest";
import { formatRelativeTime, parseApiTime } from "@/lib/relative-time";

/*
 * What a batch's page says of its results (ADR 0006, "Results"): the manifest's links, the
 * archive's parts as the shared downloads draw a job's files, and how long its files are kept.
 */

/** Each part as a job's file, so `RenderJobDownloads` draws it: "Part 1 · 1.9 GB". */
export function partOutputs(parts: IngestArchivePart[]): RenderJobOutput[] {
  return parts.map((part) => ({
    id: part.part,
    kind: "archive",
    label: `Part ${part.part}`,
    filename: part.name,
    content_type: "application/zip",
    bytes: part.bytes,
    width: null,
    height: null,
    download_url: part.download_url,
  }));
}

/** Who the manifest's links open for: anyone with publish media, else the signed-in owner. */
export function manifestLinksNote(batch: Pick<IngestBatch, "render_plan">): string {
  return batch.render_plan?.publish_media
    ? "Its links are public: the plan publishes each design's media."
    : "Its links open for you when you're signed in: the plan keeps media private. Embed links are public.";
}

/** "2 parts · 1,204 files". */
export function partsSummary(parts: IngestArchivePart[]): string {
  const files = parts.reduce((total, part) => total + (part.files ?? 0), 0);
  const count = `${parts.length} part${parts.length === 1 ? "" : "s"}`;
  return files > 0 ? `${count} · ${files.toLocaleString("en")} file${files === 1 ? "" : "s"}` : count;
}

/**
 * How long the batch keeps its files: its ZIP 14 days after it was made, its CAD files 30 days
 * after the batch finished (failed designs can't convert again once they are gone).
 */
export function retentionNotes(
  batch: Pick<IngestBatch, "archive" | "expires_at" | "sources_deleted_at">,
  now: number = Date.now(),
): string[] {
  const notes: string[] = [];
  const archive = batch.archive;
  if (archive?.expires_at && archive.parts.length > 0) {
    notes.push(`The ZIP is deleted ${formatRelativeTime(archive.expires_at)}, 14 days after it was made; build it again any time.`);
  }
  if (batch.sources_deleted_at) {
    notes.push(`Its CAD files were deleted ${formatRelativeTime(batch.sources_deleted_at)}: failed designs can no longer convert again.`);
  } else if (batch.expires_at && parseApiTime(batch.expires_at).getTime() <= now) {
    notes.push("Its CAD files were kept 30 days after the batch finished and are being deleted: failed designs can no longer convert again.");
  } else if (batch.expires_at) {
    notes.push(`Its CAD files are deleted ${formatRelativeTime(batch.expires_at)}, 30 days after the batch finished.`);
  }
  return notes;
}
