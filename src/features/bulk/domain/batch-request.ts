import type { IngestBatchCreate, IngestItem, IngestProblem, RenderPlan } from "@/lib/api/ingest";
import type { DroppedFile } from "@/lib/upload/dropped-files";
import { uploadedFilesOf } from "./design-files";
import type { PlannedDesign } from "./design-checks";

/** The longest batch name the API keeps. */
export const MAX_BATCH_NAME_LENGTH = 255;

/**
 * The create request for planned designs, in their order: each design's files and sizes only.
 * The API settles SKUs, names and categories itself, from the manifest's rows when there is one
 * and from the file names otherwise, exactly as `planDesigns` previewed them; and it checks and
 * prices the render plan, which the page only picks (none renders nothing).
 */
export function batchCreateBody(
  designs: PlannedDesign[],
  {
    name,
    manifest,
    defaultCategory,
    renderPlan = null,
  }: { name: string; manifest: string | null; defaultCategory: string; renderPlan?: RenderPlan | null },
): IngestBatchCreate {
  return {
    name: name.trim(),
    items: designs.map(({ files }) => ({
      filename: files.source.path,
      bytes: files.source.file.size,
      companions: files.companions.map(({ path, file }) => ({ filename: path, bytes: file.size })),
    })),
    manifest,
    ...(renderPlan === null ? {} : { render_plan: renderPlan }),
    options: { default_category: defaultCategory },
  };
}

export type SortedProblems = {
  /** By the design's index in the request. */
  byDesign: Map<number, IngestProblem[]>;
  /** About a manifest row no design is named for: a file not in the batch, a row with no file. */
  manifest: IngestProblem[];
  /** About the batch itself: its name, its category, the manifest as a whole. */
  batch: IngestProblem[];
};

/** Problems where they show: on their design's row, under the manifest, or over the whole batch. */
export function sortProblems(problems: IngestProblem[]): SortedProblems {
  const sorted: SortedProblems = { byDesign: new Map(), manifest: [], batch: [] };
  for (const problem of problems) {
    if (problem.item !== null) {
      sorted.byDesign.set(problem.item, [...(sorted.byDesign.get(problem.item) ?? []), problem]);
    } else if (problem.row !== null) {
      sorted.manifest.push(problem);
    } else {
      sorted.batch.push(problem);
    }
  }
  return sorted;
}

/** What one design of a made batch uploads: its item and its files, the CAD file first. */
export type DesignUpload = { itemId: number; files: DroppedFile[] };

/** The made batch's items with the files they upload, matched by their place in the request. */
export function designUploads(designs: PlannedDesign[], items: IngestItem[]): DesignUpload[] {
  const byPosition = new Map(items.map((item) => [item.position, item]));
  return designs.flatMap((design) => {
    const item = byPosition.get(design.index);
    return item ? [{ itemId: item.id, files: uploadedFilesOf(design.files) }] : [];
  });
}
