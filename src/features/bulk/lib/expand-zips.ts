import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import { baseName, cleanDropPath, folderOf, isSystemFile, type DroppedFile } from "@/lib/upload/dropped-files";

export function isZipPath(path: string): boolean {
  return /\.zip$/i.test(path);
}

function entryFile(entry: UnzipFile, path: string): Promise<DroppedFile> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  return new Promise((resolve, reject) => {
    entry.ondata = (error, chunk, final) => {
      if (error) return reject(error);
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

/**
 * The files a ZIP holds, read as a stream with fflate's `Unzip` (the server never unzips): each
 * at its path inside the ZIP, in the ZIP's own folder, as if it were extracted where it lies.
 * Folders and what Finder adds (`__MACOSX/`, `.DS_Store`) are skipped.
 */
export async function filesInZip(zip: DroppedFile): Promise<DroppedFile[]> {
  const folder = folderOf(zip.path);
  const entries: Promise<DroppedFile>[] = [];
  const unzip = new Unzip((entry) => {
    const path = cleanDropPath(folder ? `${folder}/${entry.name}` : entry.name);
    // An entry not started is skipped.
    if (entry.name.endsWith("/") || !path || isSystemFile(path)) return;
    const file = entryFile(entry, path);
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
  }
  return Promise.all(entries);
}

export type ExpandedDrop = {
  files: DroppedFile[];
  /** ZIPs that couldn't be read, and why. */
  failures: { path: string; message: string }[];
};

/** A drop with every ZIP in it replaced by the files it holds. */
export async function expandZips(files: DroppedFile[]): Promise<ExpandedDrop> {
  const expanded: ExpandedDrop = { files: [], failures: [] };
  for (const dropped of files) {
    if (!isZipPath(dropped.path)) {
      expanded.files.push(dropped);
      continue;
    }
    try {
      const inside = await filesInZip(dropped);
      if (inside.length === 0) throw new Error("it holds no files");
      expanded.files.push(...inside);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      expanded.failures.push({ path: dropped.path, message: `${baseName(dropped.path)} couldn't be opened: ${reason}` });
    }
  }
  return expanded;
}
