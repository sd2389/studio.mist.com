/** A file as it was dropped or picked, with its path relative to what was dropped. */
export type DroppedFile = {
  /** Folders as dropped, forward slashes, no leading slash: `rings/R-1001.3dm`. */
  path: string;
  file: File;
};

/** What operating systems leave beside files: Finder's resource forks and folder settings, Windows' thumbnails. */
const SYSTEM_FILE = /(^|\/)(__MACOSX(\/|$)|\.DS_Store$|\._[^/]*$|Thumbs\.db$|desktop\.ini$)/i;

export function isSystemFile(path: string): boolean {
  return SYSTEM_FILE.test(path);
}

/** A path with forward slashes, without a leading `./` or `/` or empty folders. */
export function cleanDropPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "" && part !== ".")
    .join("/");
}

/** The name of a path's file, without its folders. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The folders of a path, without its file: `rings/gold` for `rings/gold/R-1.obj`, "" for none. */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

/**
 * Paths relative to the one folder every file is in, when they share one: a dropped or picked
 * folder's files as `rings/R-1.3dm`, not `catalog/rings/R-1.3dm`, as a CSV beside them names them.
 */
export function withoutSharedFolder(files: DroppedFile[]): DroppedFile[] {
  const first = files[0]?.path.split("/")[0];
  if (!first || files.some((dropped) => !dropped.path.startsWith(`${first}/`))) return files;
  return files.map((dropped) => ({ ...dropped, path: dropped.path.slice(first.length + 1) }));
}

/** Picked files, with the folders of a picked folder (`webkitRelativePath`). */
export function filesOfInput(files: Iterable<File>): DroppedFile[] {
  return Array.from(files, (file) => ({ path: cleanDropPath(file.webkitRelativePath || file.name), file }));
}

/**
 * A drop's entries, which must be read while its event runs; null when the browser has none
 * (then `dataTransfer.files` holds the files, without folders).
 */
export function entriesOfDrop(dataTransfer: DataTransfer): FileSystemEntry[] | null {
  const items = Array.from(dataTransfer.items ?? []);
  if (items.length === 0 || typeof items[0]?.webkitGetAsEntry !== "function") return null;
  return items.map((item) => item.webkitGetAsEntry()).filter((entry): entry is FileSystemEntry => entry !== null);
}

function readFolder(folder: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = folder.createReader();
  const entries: FileSystemEntry[] = [];
  return new Promise((resolve, reject) => {
    // Each call answers a batch (Chrome's hold 100); an empty one means the folder is read.
    const readBatch = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(entries);
        entries.push(...batch);
        readBatch();
      }, reject);
    readBatch();
  });
}

function fileOfEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** Every file of dropped entries, dropped folders walked, at their paths as dropped. */
export async function filesOfEntries(entries: FileSystemEntry[]): Promise<DroppedFile[]> {
  const files: DroppedFile[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isDirectory) {
      for (const child of await readFolder(entry as FileSystemDirectoryEntry)) await walk(child);
    } else if (entry.isFile) {
      files.push({ path: cleanDropPath(entry.fullPath || entry.name), file: await fileOfEntry(entry as FileSystemFileEntry) });
    }
  };
  for (const entry of entries) await walk(entry);
  return files;
}
