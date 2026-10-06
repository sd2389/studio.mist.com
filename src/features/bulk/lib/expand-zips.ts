import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import { formatBytesShort } from "@/lib/admin/format";
import { baseName, cleanDropPath, folderOf, isSystemFile, type DroppedFile } from "@/lib/upload/dropped-files";

const MB = 1024 ** 2;

export function isZipPath(path: string): boolean {
  return /\.zip$/i.test(path);
}

/** One file's limit on every plan (backend/app/features/billing/plans.py), for when the plan's isn't known. */
export const DEFAULT_MAX_FILE_BYTES = 100 * MB;

export type ZipLimits = {
  /** The most one file may hold once unzipped: the plan's limit on a file. */
  maxFileBytes?: number | null;
  /** The most a drop's ZIPs may hold in all once unzipped: the plan's limit on a batch. */
  maxTotalBytes?: number | null;
};

/** Something a drop couldn't use, and why. */
export type LeftOut = { path: string; message: string };

/**
 * What unzipping may still take. Each entry is held in memory until it ends, so its bytes are
 * counted as they come: a ZIP's declared sizes can lie, and a ZIP bomb would fill the tab.
 */
type Budget = { maxFileBytes: number; maxTotalBytes: number | null; used: number; over: boolean };

function budgetFor({ maxFileBytes, maxTotalBytes }: ZipLimits): Budget {
  return {
    maxFileBytes: maxFileBytes && maxFileBytes > 0 ? maxFileBytes : DEFAULT_MAX_FILE_BYTES,
    maxTotalBytes: maxTotalBytes && maxTotalBytes > 0 ? maxTotalBytes : null,
    used: 0,
    over: false,
  };
}

function tooLarge(path: string, budget: Budget): LeftOut {
  const limit = formatBytesShort(budget.maxFileBytes);
  return { path, message: `${baseName(path)} is over ${limit} unzipped, and a file may be at most ${limit}, so it was left out.` };
}

function entryFile(entry: UnzipFile, path: string, budget: Budget): Promise<DroppedFile | LeftOut> {
  // Not started, an entry is skipped.
  if ((entry.originalSize ?? 0) > budget.maxFileBytes) return Promise.resolve(tooLarge(path, budget));
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  return new Promise((resolve, reject) => {
    entry.ondata = (error, chunk, final) => {
      if (error) return reject(error);
      size += chunk.length;
      budget.used += chunk.length;
      if (budget.maxTotalBytes !== null && budget.used > budget.maxTotalBytes) {
        budget.over = true;
        entry.terminate();
        return reject(new Error(`unzipped, it holds more than a batch may (${formatBytesShort(budget.maxTotalBytes)})`));
      }
      if (size > budget.maxFileBytes) {
        entry.terminate();
        budget.used -= size; // dropped, so held no longer
        return resolve(tooLarge(path, budget));
      }
      chunks.push(chunk as Uint8Array<ArrayBuffer>);
      if (final) resolve({ path, file: new File(chunks, baseName(path)) });
    };
    try {
      entry.start();
    } catch (error) {
      reject(error);
    }
  });
}

export type ZipContents = { files: DroppedFile[]; leftOut: LeftOut[] };

/**
 * The files a ZIP holds, read as a stream with fflate's `Unzip` (the server never unzips): each
 * at its path inside the ZIP, in the ZIP's own folder, as if it were extracted where it lies.
 * Folders and what Finder adds (`__MACOSX/`, `.DS_Store`) are skipped, and a file over the
 * plan's limit is left out once it passes it. Over the batch's limit in all, the ZIP fails.
 */
export async function filesInZip(zip: DroppedFile, limits: ZipLimits = {}, budget = budgetFor(limits)): Promise<ZipContents> {
  const folder = folderOf(zip.path);
  const entries: Promise<DroppedFile | LeftOut>[] = [];
  const unzip = new Unzip((entry) => {
    const path = cleanDropPath(folder ? `${folder}/${entry.name}` : entry.name);
    if (budget.over || entry.name.endsWith("/") || !path || isSystemFile(path)) return;
    const file = entryFile(entry, path, budget);
    file.catch(() => {}); // read below, with the others
    entries.push(file);
  });
  unzip.register(UnzipInflate);

  const reader = zip.file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    // A corrupt archive throws here, or fails its entries.
    unzip.push(done ? new Uint8Array(0) : value, done);
    if (done) break;
    if (budget.over) {
      await reader.cancel();
      break;
    }
  }
  const read = await Promise.all(entries);
  return {
    files: read.filter((entry): entry is DroppedFile => "file" in entry),
    leftOut: read.filter((entry): entry is LeftOut => !("file" in entry)),
  };
}

export type ExpandedDrop = {
  files: DroppedFile[];
  /** ZIPs that couldn't be read, and files left out of them, and why. */
  failures: LeftOut[];
};

/** A drop with every ZIP in it replaced by the files it holds, within the plan's limits. */
export async function expandZips(files: DroppedFile[], limits: ZipLimits = {}): Promise<ExpandedDrop> {
  const expanded: ExpandedDrop = { files: [], failures: [] };
  // One budget for the drop: its ZIPs together may hold no more than one batch.
  const budget = budgetFor(limits);
  for (const dropped of files) {
    if (!isZipPath(dropped.path)) {
      expanded.files.push(dropped);
      continue;
    }
    if (budget.over) {
      const message = `${baseName(dropped.path)} wasn't opened: the ZIPs before it already hold more than a batch may.`;
      expanded.failures.push({ path: dropped.path, message });
      continue;
    }
    try {
      const inside = await filesInZip(dropped, limits, budget);
      if (inside.files.length === 0 && inside.leftOut.length === 0) throw new Error("it holds no files");
      expanded.files.push(...inside.files);
      expanded.failures.push(...inside.leftOut);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      expanded.failures.push({ path: dropped.path, message: `${baseName(dropped.path)} couldn't be opened: ${reason}` });
    }
  }
  return expanded;
}
