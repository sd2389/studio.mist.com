import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { EncoderError, startVideoEncoder } from "./encode.mjs";
import { JobFailure } from "./failure.mjs";
import { writeZip, ZipTooLarge } from "./zip.mjs";

/*
 * What a job's page hands the sink, and the outputs the worker makes of it, by kind (ADR 0005): a
 * still's or an angle set's images go up as the page encoded them; a turntable's raw frames go
 * into ffmpeg as the sink takes them, and its MP4 goes up; a spin's frames and viewer page go into
 * one ZIP once the page is done; a Campaign Pack's files, and the MP4 ffmpeg makes of each of its
 * turntables' frames, go into one ZIP in the order the page made them. Each output is the file the
 * API planned (planned_outputs in backend/app/features/render_jobs/job_files.py): its name,
 * content type, size cap and frame size.
 */

/** A turntable's MP4 and a spin's or a pack's ZIP, as the API plans them. fflate writes no ZIP64. */
const VIDEO = { contentType: "video/mp4", maxBytes: 4 * 1024 ** 3 };
const ZIP = { contentType: "application/zip", maxBytes: 4 * 1024 ** 3 - 1 };
/** The viewer page beside a spin's frames (SPIN_VIEWER_NAME in src/features/render/harness/spin-files.ts). */
const SPIN_VIEWER = "spin.html";
/** A pack's turntables at each of its formats' sizes (TURNTABLE_FORMATS in src/features/render/campaign-pack/domain/defaults.ts). */
export const PACK_VIDEO_SIZES = { landscape: [1920, 1080], square: [1080, 1080], vertical: [1080, 1920] };
/** A pack's turntables encode as a turntable job does by default. */
const PACK_VIDEO_QUALITY = "high";
/** The most documents a pack has: its spin viewer, embed page and snippet, README and manifest. */
const PACK_DOCUMENTS = 5;
/** What fflate's ZIP adds to an entry, its name twice aside: the local header, data descriptor and central header. */
const ZIP_ENTRY_BYTES = 30 + 16 + 46;
/** The ZIP's end of central directory record. */
export const ZIP_END_BYTES = 22;

/** What an entry of `bytes` under `name` adds to the ZIP writeZip makes. */
export const zipEntryBytes = (name, bytes) => bytes + ZIP_ENTRY_BYTES + 2 * Buffer.byteLength(name);

/** Text, which a ZIP deflates; media is compressed already. */
const isText = (contentType) => contentType.startsWith("text/") || contentType === "application/json";

/**
 * A spin's files in the order they turn, as its page posts them: the frames, numbered as the
 * Campaign Pack numbers spin frames (`spinFrameNames` in src/features/render/harness/spin-files.ts),
 * then the viewer page.
 */
export function spinFileNames({ frames, format }) {
  const extension = format === "jpeg" ? "jpg" : "png";
  const digits = Math.max(3, String(frames).length);
  const frameNames = Array.from({ length: frames }, (_, index) => `frame_${String(index + 1).padStart(digits, "0")}.${extension}`);
  return [...frameNames, SPIN_VIEWER];
}

/** Every file in `names`, in that order, as the page reported it and the sink stored it. */
function collectFiles(names, result, sink) {
  const reported = new Map((result?.outputs ?? []).map((output) => [output.name, output]));
  if (reported.size !== names.length || names.some((name) => !reported.has(name))) {
    throw new JobFailure("unknown", `The page made ${[...reported.keys()].join(", ") || "nothing"}; the job makes ${names.join(", ")}.`);
  }
  return names.map((name) => {
    const output = reported.get(name);
    const file = sink.files.get(name);
    if (!file) throw new JobFailure("unknown", `The page reported ${name} but the sink never got it.`);
    if (file.contentType !== output.content_type) throw new JobFailure("unknown", `${name} came as ${file.contentType}, not ${output.content_type}.`);
    return { ...output, label: output.label ?? null, path: file.path, bytes: file.bytes, sha256: file.sha256 };
  });
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

/** A still's or an angle set's images, posted under the names the API gave them and uploaded as they are. */
function imageOutputs({ spec }) {
  return {
    sink: { names: spec.output_names },
    encodes: false,
    finish: async (result, sink) => collectFiles(spec.output_names, result, sink),
    stop: async () => {},
  };
}

/** A turntable: its raw frames go into ffmpeg as the sink takes them, and the MP4 is done once the last is in. */
function videoOutputs({ spec }, { outDir, ffmpegPath, onEncoded, onFailure }) {
  const [name] = spec.output_names;
  const outPath = path.join(outDir, name);
  let encoder;
  try {
    encoder = startVideoEncoder({
      ffmpegPath,
      spec,
      outPath,
      onEncoded: (encoded) => onEncoded(encoded / spec.frames),
      onFailure: (error) => onFailure(new JobFailure("encode_failed", error.message)),
    });
  } catch (error) {
    // ffmpeg's arguments refuse the spec.
    throw error instanceof RangeError ? new JobFailure("invalid_spec", error.message) : error;
  }
  return {
    sink: { names: [], frameSize: { width: spec.width, height: spec.height }, onFrameBytes: (_index, bytes) => encoder.write(bytes) },
    encodes: true,
    async finish(_result, sink) {
      if (sink.frames !== spec.frames) throw new JobFailure("unknown", `The page sent ${sink.frames} of the clip's ${spec.frames} frames.`);
      let encoded;
      try {
        ({ encoded } = await encoder.finish());
      } catch (error) {
        throw error instanceof EncoderError ? new JobFailure("encode_failed", error.message) : error;
      }
      if (encoded !== spec.frames) throw new JobFailure("encode_failed", `ffmpeg encoded ${encoded} of the clip's ${spec.frames} frames.`);
      const file = await hashFile(outPath);
      if (file.bytes > VIDEO.maxBytes) throw new JobFailure("over_limit", `The MP4 is ${file.bytes} bytes, more than the ${VIDEO.maxBytes} a video may be.`);
      return [{ name, content_type: VIDEO.contentType, width: spec.width, height: spec.height, label: null, path: outPath, ...file }];
    },
    stop: () => encoder.stop(),
  };
}

/** A spin: its frames and viewer page go to disk as the page posts them, then into one ZIP. */
function spinOutputs({ spec }, { outDir, onEncoded }) {
  const names = spinFileNames(spec);
  const [name] = spec.output_names;
  return {
    sink: { names },
    encodes: true,
    async finish(result, sink, signal) {
      const entries = collectFiles(names, result, sink).map((file) => ({ name: file.name, path: file.path, compress: isText(file.content_type) }));
      const zipped = await zipEntries(entries, path.join(outDir, name), { what: "spin", signal, onEncoded });
      return [{ name, content_type: ZIP.contentType, width: spec.size, height: spec.size, label: null, ...zipped }];
    },
    stop: async () => {},
  };
}

/**
 * Writes the entries into one ZIP at `zipPath`, each file deleted once it is in, so the job's
 * folder holds the files about once. Resolves with the ZIP's `path`, `bytes` and `sha256`.
 */
async function zipEntries(entries, zipPath, { what, signal, onEncoded }) {
  try {
    const zipped = await writeZip(entries, zipPath, {
      maxBytes: ZIP.maxBytes,
      signal,
      onAdded: async (entry, added) => {
        await rm(entry.path);
        onEncoded(added / entries.length);
      },
    });
    return { path: zipPath, ...zipped };
  } catch (error) {
    throw error instanceof ZipTooLarge ? new JobFailure("over_limit", `The ${what}'s ZIP is too large: ${error.message}.`) : error;
  }
}

/** The most entries a pack's ZIP can have: every still, the ASET image, every spin frame and turntable, the documents. */
export function packEntryLimit({ metals, angleIds, formats, cutScope, spin, turntable }) {
  const stills = metals.length * angleIds.length * (Number(formats.jpg) + Number(formats.png));
  const spins = spin.enabled ? metals.length * spin.frames : 0;
  const videos = turntable.enabled ? metals.length * turntable.formats.length : 0;
  return stills + Number(cutScope) + spins + videos + PACK_DOCUMENTS;
}

/**
 * A pack's turntables, as its page opens them: each must be one the spec makes (a format's size,
 * the spec's rate and length, no more of them than its metals and formats make) and goes into an
 * ffmpeg of its own, one at a time. A clip ffmpeg fails, or encodes fewer frames than it got,
 * stops the job as `encode_failed`.
 */
function packVideos({ metals, turntable }, { outDir, ffmpegPath, onFailure }) {
  const sizes = turntable.enabled ? turntable.formats.map((format) => PACK_VIDEO_SIZES[format]) : [];
  const frames = turntable.durationSec * turntable.fps;
  const most = sizes.length * metals.length;
  let opened = 0;
  let running = null;
  const failed = (failure) => {
    onFailure(failure);
    return failure;
  };
  return {
    async open(name, clip) {
      const sized = sizes.some(([width, height]) => width === clip.width && height === clip.height);
      if (!name.endsWith(".mp4") || !sized || clip.fps !== turntable.fps || clip.frames !== frames || opened >= most) {
        throw new Error(`the pack makes no turntable ${name} of ${clip.frames} frames of ${clip.width}x${clip.height} at ${clip.fps} fps`);
      }
      const outPath = path.join(outDir, `video-${opened}.mp4`);
      opened += 1;
      const encoder = startVideoEncoder({
        ffmpegPath,
        spec: { width: clip.width, height: clip.height, fps: clip.fps, quality: PACK_VIDEO_QUALITY },
        outPath,
        onFailure: (error) => onFailure(new JobFailure("encode_failed", `${name}: ${error.message}`)),
      });
      running = encoder;
      return {
        write: (bytes) => encoder.write(bytes),
        async finish() {
          let encoded;
          try {
            ({ encoded } = await encoder.finish());
          } catch (error) {
            throw failed(error instanceof EncoderError ? new JobFailure("encode_failed", `${name}: ${error.message}`) : error);
          } finally {
            running = null;
          }
          if (encoded !== clip.frames) throw failed(new JobFailure("encode_failed", `ffmpeg encoded ${encoded} of ${name}'s ${clip.frames} frames.`));
          const file = await hashFile(outPath);
          if (file.bytes > VIDEO.maxBytes) throw failed(new JobFailure("over_limit", `${name} is ${file.bytes} bytes, more than the ${VIDEO.maxBytes} a video may be.`));
          return { path: outPath, ...file };
        },
      };
    },
    stop: async () => running?.stop(),
  };
}

/** The pack's ZIP, entry by entry: what the page says it made, in its order, each as the sink stored it. */
function packEntries(result, sink) {
  if (sink.openVideo) throw new JobFailure("unknown", `The page left ${sink.openVideo} unfinished.`);
  const made = (result?.entries ?? []).map((entry) => `${entry.path} (${entry.content_type})`);
  const stored = [...sink.files].map(([name, file]) => `${name} (${file.contentType})`);
  const differs = made.findIndex((entry, index) => entry !== stored[index]);
  if (differs !== -1 || made.length !== stored.length) {
    const at = differs === -1 ? Math.min(made.length, stored.length) : differs;
    throw new JobFailure("unknown", `The pack's entry ${at + 1}: the page made ${made[at] ?? "nothing"}, the sink holds ${stored[at] ?? "nothing"}.`);
  }
  return [...sink.files].map(([name, file]) => ({ name, path: file.path, compress: isText(file.contentType) }));
}

/**
 * A Campaign Pack: its files go to disk under their paths in the ZIP as the page posts them, and
 * each turntable's frames into ffmpeg, whose MP4 the sink stores under its path when the page
 * closes it. Once the page is done, the files go into one ZIP in that order, reported as the API
 * plans it: no frame size, since its stills, videos and spins differ. A pack whose files already
 * pass the ZIP's cap stops as `over_limit` before it renders more.
 */
function packOutputs({ spec }, { outDir, ffmpegPath, onEncoded, onFailure }) {
  const [name] = spec.output_names;
  const videos = packVideos(spec, { outDir, ffmpegPath, onFailure });
  let projected = ZIP_END_BYTES;
  return {
    sink: {
      paths: true,
      maxFiles: packEntryLimit(spec),
      videos,
      onStored: (entry, file) => {
        projected += zipEntryBytes(entry, file.bytes);
        if (projected > ZIP.maxBytes) onFailure(new JobFailure("over_limit", `The pack passes the ${ZIP.maxBytes} bytes its ZIP may be, at ${entry}.`));
      },
    },
    encodes: true,
    async finish(result, sink, signal) {
      const entries = packEntries(result, sink);
      const zipped = await zipEntries(entries, path.join(outDir, name), { what: "pack", signal, onEncoded });
      return [{ name, content_type: ZIP.contentType, width: null, height: null, label: null, ...zipped }];
    },
    stop: () => videos.stop(),
  };
}

/**
 * Starts what a job's outputs need, before its page opens. Returns `sink`, the sink's options for
 * what the page posts (file `names`; a turntable's `frameSize` and `onFrameBytes`; a pack's `paths`,
 * `maxFiles`, `videos` and `onStored`); `encodes`, whether the outputs take an encoding stage once
 * the page is done; `finish(result, sink, signal)`, which resolves with the outputs to upload
 * (`{ name, content_type, width, height, label, path, bytes, sha256 }`); and `stop()`, which ends
 * whatever still runs.
 *
 * @param {object} payload The job's payload.
 * @param {object} options
 * @param {string} options.outDir The job's folder for the page's files and the outputs.
 * @param {string} options.ffmpegPath
 * @param {(share: number) => void} options.onEncoded The share of the outputs encoded so far.
 * @param {(failure: JobFailure) => void} options.onFailure The encoder stopped by itself: the job stops.
 */
export function startOutputs(payload, options) {
  if (payload.kind === "turntable") return videoOutputs(payload, options);
  if (payload.kind === "spin") return spinOutputs(payload, options);
  if (payload.kind === "campaign_pack") return packOutputs(payload, options);
  return imageOutputs(payload);
}
