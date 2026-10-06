import type { IngestItem } from "@/lib/api/ingest";
import { baseName, type DroppedFile } from "@/lib/upload/dropped-files";
import type { DesignUpload } from "./batch-request";

export type ResumedUploads = {
  uploads: DesignUpload[];
  /** Designs still waiting whose files the drop didn't hold, at their declared sizes. */
  missing: IngestItem[];
};

/**
 * The files dropped again for designs still awaiting their uploads, after the page was left:
 * each file by its path as first dropped (with or without the folder it was dropped in), else
 * by a file name only one dropped file has, in any case and only at the size it declared.
 */
export function resumeUploads(items: IngestItem[], files: DroppedFile[]): ResumedUploads {
  const byPath = new Map<string, DroppedFile>();
  const byName = new Map<string, DroppedFile[]>();
  for (const dropped of files) {
    const path = dropped.path.toLowerCase();
    byPath.set(path, dropped);
    const inside = path.slice(path.indexOf("/") + 1);
    if (inside !== path && !byPath.has(inside)) byPath.set(inside, dropped);
    const name = baseName(path);
    byName.set(name, [...(byName.get(name) ?? []), dropped]);
  }
  const find = (path: string, bytes: number): DroppedFile | null => {
    const exact = byPath.get(path.toLowerCase());
    if (exact) return exact.file.size === bytes ? exact : null;
    const named = byName.get(baseName(path).toLowerCase()) ?? [];
    return named.length === 1 && named[0].file.size === bytes ? named[0] : null;
  };

  const uploads: DesignUpload[] = [];
  const missing: IngestItem[] = [];
  for (const item of items) {
    const wanted = [{ filename: item.filename, bytes: item.bytes }, ...item.companions];
    const found = wanted.map(({ filename, bytes }) => find(filename, bytes));
    if (found.every((dropped): dropped is DroppedFile => dropped !== null)) {
      // Each file goes up under the name the design gave it, which its signed URL names.
      uploads.push({ itemId: item.id, files: found.map((dropped, index) => ({ ...dropped, path: wanted[index].filename })) });
    } else {
      missing.push(item);
    }
  }
  return { uploads, missing };
}
