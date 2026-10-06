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
 * one ZIP once the page is done. Each output is the file the API planned (planned_outputs in
 * backend/app/features/render_jobs/job_files.py): its name, content type, size cap and frame size.
 */

/** A turntable's MP4 and a spin's ZIP, as the API plans them. fflate writes no ZIP64. */
const VIDEO = { contentType: "video/mp4", maxBytes: 4 * 1024 ** 3 };
const SPIN_ZIP = { contentType: "application/zip", maxBytes: 4 * 1024 ** 3 - 1 };
/** The viewer page beside a spin's frames (SPIN_VIEWER_NAME in src/features/render/harness/spin-files.ts). */
const SPIN_VIEWER = "spin.html";

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
      const entries = collectFiles(names, result, sink).map((file) => ({ name: file.name, path: file.path, compress: file.content_type.startsWith("text/") }));
      const zipPath = path.join(outDir, name);
      let zipped;
      try {
        zipped = await writeZip(entries, zipPath, {
          maxBytes: SPIN_ZIP.maxBytes,
          signal,
          // Each file goes once it is in the ZIP, so the job's folder holds the spin about once.
          onAdded: async (entry, added) => {
            await rm(entry.path);
            onEncoded(added / entries.length);
          },
        });
      } catch (error) {
        throw error instanceof ZipTooLarge ? new JobFailure("over_limit", `The spin's ZIP is too large: ${error.message}.`) : error;
      }
      return [{ name, content_type: SPIN_ZIP.contentType, width: spec.size, height: spec.size, label: null, path: zipPath, ...zipped }];
    },
    stop: async () => {},
  };
}

/**
 * Starts what a job's outputs need, before its page opens. Returns `sink`, the sink's options for
 * what the page posts (file `names`; a turntable's `frameSize` and `onFrameBytes`); `encodes`, whether
 * the outputs take an encoding stage once the page is done; `finish(result, sink, signal)`, which
 * resolves with the outputs to upload (`{ name, content_type, width, height, label, path, bytes,
 * sha256 }`); and `stop()`, which ends whatever still runs.
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
  return imageOutputs(payload);
}
