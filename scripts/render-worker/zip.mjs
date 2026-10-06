import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

/*
 * ZIPs on disk (ADR 0005, "ZIP"): files stream from disk through fflate's `Zip` into the archive,
 * a chunk at a time, so neither the files nor the archive are ever in memory. fflate writes no
 * ZIP64: an archive stays under 4 GB and 65,535 entries.
 */

const MAX_ENTRIES = 0xffff;
/** The level the Campaign Pack deflates its text with (zip-writer.ts). */
const DEFLATE_LEVEL = 6;

/** The archive would pass its size cap (or ZIP's 65,535 entries). */
export class ZipTooLarge extends Error {
  constructor(message) {
    super(message);
    this.name = "ZipTooLarge";
  }
}

/** The archive's bytes, from fflate, as each entry's chunks are read from disk and pushed through. */
async function* archiveChunks(entries, { modifiedAt, onAdded }) {
  let ready = [];
  let failure = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else if (chunk.length) ready.push(chunk);
  });
  const take = () => {
    if (failure) throw failure;
    const chunks = ready;
    ready = [];
    return chunks;
  };
  for (const [index, entry] of entries.entries()) {
    const file = entry.compress ? new ZipDeflate(entry.name, { level: DEFLATE_LEVEL }) : new ZipPassThrough(entry.name);
    // One time for every header, local and central (fflate reads the clock for each otherwise).
    file.mtime = modifiedAt;
    zip.add(file);
    for await (const chunk of createReadStream(entry.path)) {
      file.push(chunk);
      yield* take();
    }
    file.push(new Uint8Array(0), true);
    yield* take();
    await onAdded?.(entry, index + 1);
  }
  zip.end();
  yield* take();
}

/**
 * Writes `entries` into a new ZIP at `outPath`, in order: stored, or deflated when `compress`
 * (text; images are compressed already). Reading waits on writing, so at most a few chunks are in
 * memory. Past `maxBytes` it stops with ZipTooLarge; on any failure the partial file goes.
 *
 * @param {{ name: string, path: string, compress?: boolean }[]} entries
 * @param {string} outPath
 * @param {object} options
 * @param {number} options.maxBytes
 * @param {AbortSignal} [options.signal]
 * @param {(entry: object, added: number) => Promise<void> | void} [options.onAdded] After each entry's last chunk.
 * @returns {Promise<{ bytes: number, sha256: string }>}
 */
export async function writeZip(entries, outPath, { maxBytes, signal, onAdded }) {
  if (entries.length > MAX_ENTRIES) throw new ZipTooLarge(`a ZIP holds at most ${MAX_ENTRIES} files, not ${entries.length}`);
  const hash = createHash("sha256");
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        done(new ZipTooLarge(`the ZIP passes ${maxBytes} bytes`));
        return;
      }
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    const chunks = Readable.from(archiveChunks(entries, { modifiedAt: new Date(), onAdded }));
    await pipeline(chunks, meter, createWriteStream(outPath), { signal });
  } catch (error) {
    await rm(outPath, { force: true });
    throw error;
  }
  return { bytes, sha256: hash.digest("hex") };
}
