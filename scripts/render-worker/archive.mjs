import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError, JobLostError, TooLargeError } from "./api.mjs";
import { JobFailure } from "./failure.mjs";
import { completeBody, settleFailure, startHeartbeats, uploadOutputs } from "./job.mjs";
import { ZIP_END_BYTES, zipEntryBytes } from "./outputs.mjs";
import { archiveProgress } from "./progress.mjs";
import { writeZip, ZipTooLarge } from "./zip.mjs";

/*
 * A `batch_archive` job (ADR 0006, "Results"): every file a bulk upload's designs made, and the
 * batch's manifest, in ZIP parts of at most `part_bytes` (archive_spec.py in the API). No page and
 * no browser: the worker fetches each file by the signed URL the payload gives, streams it into
 * the part being written (the manifest first in the first part; media stored, the manifest
 * deflated, as every ZIP of the worker's), uploads each part as soon as it is written and deletes
 * it, so the job's folder holds about one part and one file at a time; then it completes the job
 * with every part. A file that would pass what is left of a part starts the next one; a file
 * larger than a part goes in one of its own.
 */

export const ARCHIVE_KIND = "batch_archive";
const ZIP_CONTENT_TYPE = "application/zip";
/** fflate writes no ZIP64: a part with one file larger than `part_bytes` still stays under this. */
const ZIP_MAX_BYTES = 4 * 1024 ** 3 - 1;
/** A batch archive's run time limit (MAX_RUNTIME_SECONDS in the API), for a payload that gives none. */
const DEFAULT_RUNTIME_SECONDS = 1800;

/** The most deflate makes of `bytes` of text: a part's room for its manifest (deflated_at_most in the API's archive_spec.py). */
const deflatedAtMost = (bytes) => Math.ceil(bytes * 1.01) + 1024;

/** What a part is called: `<stem>-part-<n>.zip`, as the API plans it. */
export const archivePartName = (spec, number) => `${spec.stem}-part-${number}.zip`;

/**
 * Writes the manifest, then every file, into ZIP parts in order (see above). Each file is fetched
 * into `dir` just before it goes into a part, and deleted once it is in; each part, once written,
 * is handed to `onPart` (which uploads it) and then deleted. More parts than `maxParts` stop it
 * as `over_limit`. The API counts the parts a job may make with this packing, mirrored
 * (parts_needed in backend/app/features/render_jobs/archive_spec.py; both are checked against
 * backend/tests/fixtures/archive_packing.json): keep the two the same.
 *
 * @param {object} options
 * @param {{ name: string, path: string, bytes: number }} options.manifest On disk already.
 * @param {{ path: string }[]} options.files Where each goes in the archive, in order.
 * @param {number} options.partBytes
 * @param {number} options.maxParts
 * @param {(number: number) => string} options.partName
 * @param {string} options.dir
 * @param {(file: object, dest: string) => Promise<number>} options.fetchFile Fetches a file to `dest`; its bytes.
 * @param {(part: object) => Promise<void>} options.onPart `{ name, path, bytes, sha256, files, content_type, width, height, label }`.
 * @param {() => void} [options.onEntry] After each entry is in a part.
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ parts: number, entries: number }>}
 */
export async function writeArchiveParts({ manifest, files, partBytes, maxParts, partName, dir, fetchFile, onPart, onEntry, signal }) {
  let next = 0;
  /** A file fetched for a part it didn't fit: the next part starts with it. */
  let carried = null;
  const fetchNext = async () => {
    const index = next;
    next += 1;
    const dest = path.join(dir, `file-${index}`);
    const bytes = await fetchFile(files[index], dest);
    return { name: files[index].path, path: dest, bytes, compress: false };
  };
  for (let number = 1; ; number += 1) {
    if (number > maxParts) throw new JobFailure("over_limit", `The archive needs more than the ${maxParts} parts its job may make.`);
    let projected = ZIP_END_BYTES;
    let entries = 0;
    async function* partEntries() {
      if (number === 1) {
        projected += zipEntryBytes(manifest.name, deflatedAtMost(manifest.bytes));
        entries += 1;
        yield { name: manifest.name, path: manifest.path, compress: true };
      }
      while (carried || next < files.length) {
        const entry = carried ?? (await fetchNext());
        carried = null;
        const adds = zipEntryBytes(entry.name, entry.bytes);
        if (entries > 0 && projected + adds > partBytes) {
          carried = entry;
          return;
        }
        projected += adds;
        entries += 1;
        yield entry;
      }
    }
    const name = partName(number);
    const outPath = path.join(dir, name);
    let zipped;
    try {
      zipped = await writeZip(partEntries(), outPath, {
        maxBytes: ZIP_MAX_BYTES,
        signal,
        onAdded: async (entry) => {
          await rm(entry.path, { force: true });
          onEntry?.();
        },
      });
    } catch (error) {
      throw error instanceof ZipTooLarge ? new JobFailure("over_limit", `Part ${number} of the archive is too large: ${error.message}.`) : error;
    }
    await onPart({ name, path: outPath, files: entries, content_type: ZIP_CONTENT_TYPE, width: null, height: null, label: null, ...zipped });
    await rm(outPath, { force: true });
    if (!carried && next >= files.length) return { parts: number, entries: files.length + 1 };
  }
}

/** Fetches one of the batch's files: the bytes the API has for it, or at most the most it may be. */
async function fetchArchiveFile(job, file, dest, signal) {
  let bytes;
  try {
    bytes = await job.download(file.source, dest, { maxBytes: file.max_bytes, signal });
  } catch (error) {
    if (error instanceof TooLargeError) throw new JobFailure("input_missing", `${file.path} is larger than the ${file.max_bytes} bytes it may be.`);
    if (error instanceof ApiError && !(error instanceof JobLostError) && [403, 404, 410].includes(error.status)) {
      throw new JobFailure("input_missing", `${file.path} could not be read: ${error.message}`);
    }
    throw error;
  }
  if (file.bytes != null && bytes !== file.bytes) throw new JobFailure("input_missing", `${file.path} is ${bytes} bytes, not the ${file.bytes} it was stored with.`);
  return bytes;
}

function checkPayload(payload) {
  const spec = payload?.spec;
  const fine =
    payload?.kind === ARCHIVE_KIND &&
    typeof payload.manifest === "string" &&
    typeof payload.manifest_name === "string" &&
    Array.isArray(payload.files) &&
    payload.files.every((file) => typeof file?.path === "string" && (file.source?.url || file.source?.path) && file.max_bytes > 0) &&
    typeof spec?.stem === "string" &&
    spec.part_bytes > 0 &&
    spec.max_parts >= 1;
  if (!fine) throw new JobFailure("invalid_spec", "The payload doesn't say what goes in the archive.");
}

/** Completes the job with every part; the parts are gone from disk, so a 400 can't be met by uploading them again. */
async function completeArchive(job, parts, signal) {
  try {
    await job.complete(completeBody(parts, null), signal);
  } catch (error) {
    if (error instanceof ApiError && !(error instanceof JobLostError) && error.status === 400) throw new JobFailure("upload_failed", error.message);
    throw error;
  }
}

/**
 * Builds one claimed archive and reports how it ended, as `runJob` does a render. Never throws.
 *
 * @param {object} options
 * @param {object} options.claim What `claim` answered.
 * @param {ReturnType<import("./api.mjs").createApiClient>} options.api
 * @param {object} options.config `tmpDir`.
 * @param {AbortSignal} options.stopping Aborted when the worker shuts down.
 * @returns {Promise<{ outcome: "completed" | "failed" | "lost", recycleBrowser: boolean }>}
 */
export async function runArchiveJob({ claim, api, config, stopping, log }) {
  const claimedAt = Date.now();
  const job = api.job(claim);
  const controller = new AbortController();
  const signal = controller.signal;
  const stop = () => controller.abort(new JobFailure("unknown", "The worker shut down."));
  stopping.addEventListener("abort", stop, { once: true });
  if (stopping.aborted) stop();
  const done = { stage: "loading", archived: 0 };
  const heartbeats = startHeartbeats(job, { seconds: claim.heartbeat_seconds, report: () => archiveProgress(done), controller, log });
  const enterStage = (stage) => {
    if (done.stage === stage) return;
    done.stage = stage;
    heartbeats.now();
  };
  let dir = null;
  let deadline = null;
  try {
    dir = await mkdtemp(path.join(config.tmpDir, `job-${job.id}-`));
    const payload = await job.payload(signal);
    checkPayload(payload);
    heartbeats.now();
    const runFor = (payload.limits?.max_runtime_seconds ?? DEFAULT_RUNTIME_SECONDS) * 1000 - (Date.now() - claimedAt);
    deadline = setTimeout(() => controller.abort(new JobFailure("timeout", "The job ran past its run time.")), Math.max(runFor, 0));
    const manifestPath = path.join(dir, "manifest");
    await writeFile(manifestPath, payload.manifest);
    // Each entry counts once going into a part and once more when its part is uploaded.
    const steps = 2 * (payload.files.length + 1);
    let stepsDone = 0;
    const step = (count = 1) => {
      stepsDone += count;
      done.archived = stepsDone / steps;
    };
    const uploaded = [];
    enterStage("encoding");
    await writeArchiveParts({
      manifest: { name: payload.manifest_name, path: manifestPath, bytes: Buffer.byteLength(payload.manifest) },
      files: payload.files,
      partBytes: payload.spec.part_bytes,
      maxParts: payload.spec.max_parts,
      partName: (number) => archivePartName(payload.spec, number),
      dir,
      signal,
      fetchFile: (file, dest) => fetchArchiveFile(job, file, dest, signal),
      onEntry: () => step(),
      onPart: async (part) => {
        enterStage("uploading");
        uploaded.push(...(await uploadOutputs(job, [part], { signal, log })));
        step(part.files);
        enterStage("encoding");
      },
    });
    signal.throwIfAborted();
    enterStage("uploading");
    await completeArchive(job, uploaded, signal);
    log(`completed: ${uploaded.map((part) => `${part.name} (${part.files} files, ${part.bytes} bytes)`).join(", ")}`);
    return { outcome: "completed", recycleBrowser: false };
  } catch (error) {
    return await settleFailure(job, signal.aborted ? signal.reason : error, log);
  } finally {
    clearTimeout(deadline);
    heartbeats.stop();
    stopping.removeEventListener("abort", stop);
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
