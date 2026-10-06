import { spawn as spawnProcess } from "node:child_process";
import { createInterface } from "node:readline";

/*
 * Turntables to MP4 (ADR 0005, "Video"): one ffmpeg per clip, with the page's raw RGBA frames on
 * its stdin as the sink takes them. The worker runs the host's ffmpeg (WORKER_FFMPEG), which
 * needs libx264; the worker image installs Debian's.
 */

/** x264 for each quality a turntable asks for: the CRF ADR 0005 names, and the preset. */
export const VIDEO_QUALITY = {
  standard: { crf: 23, preset: "medium" },
  high: { crf: 20, preset: "medium" },
  max: { crf: 17, preset: "slow" },
};

/** RGB to limited-range BT.709 YUV 4:2:0, the frames tagged so. */
const TO_BT709 = "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv";
/** How much of what ffmpeg said on stderr a failure keeps: the end of it. */
const STDERR_KEPT = 1500;
const CHECK_TIMEOUT_MS = 15_000;

export class EncoderError extends Error {
  constructor(message) {
    super(message);
    this.name = "EncoderError";
  }
}

const isEven = (value) => Number.isInteger(value) && value > 0 && value % 2 === 0;

/**
 * ffmpeg's arguments for one turntable: raw RGBA frames of `width` × `height` on stdin at `fps`,
 * to an H.264 High MP4 at `outPath`, with the CRF and preset of its `quality`. RGB becomes
 * limited-range yuv420p by the BT.709 matrix, and the frames and the stream say so: without that
 * ffmpeg converts with BT.601 and leaves the tags empty, and metals shift colour. `+faststart`
 * puts the index ahead of the media, so a browser plays it before all of it is in. Progress
 * reports (`frame=<encoded>`) go to stdout.
 */
export function videoArgs({ width, height, fps, quality }, outPath) {
  const x264 = VIDEO_QUALITY[quality];
  if (!x264) throw new RangeError(`no video quality "${quality}"`);
  if (!isEven(width) || !isEven(height)) throw new RangeError(`a video's width and height must be even, not ${width}x${height}`);
  if (!Number.isInteger(fps) || fps < 1) throw new RangeError(`a video's fps must be a whole number, not ${fps}`);
  return [
    "-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`, "-r", String(fps), "-i", "pipe:0",
    "-vf", TO_BT709,
    "-c:v", "libx264", "-preset", x264.preset, "-crf", String(x264.crf), "-profile:v", "high",
    // The stream's tags as well, for an ffmpeg that doesn't hand the frames' tags to the encoder.
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
    "-movflags", "+faststart", "-an", "-y", outPath,
  ];
}

/**
 * Starts ffmpeg on one clip (`videoArgs`) and feeds it the frames' bytes in order, a frame or a
 * part of one at a time: `write(bytes)` resolves once ffmpeg's pipe has taken all of them, and
 * the sink answers the page, which then sends more, only after that. `finish()` closes stdin and
 * resolves once the MP4 is complete.
 *
 * @param {object} options
 * @param {string} options.ffmpegPath
 * @param {{ width: number, height: number, fps: number, quality: string }} options.spec
 * @param {string} options.outPath
 * @param {(encoded: number) => void} [options.onEncoded] Frames encoded so far, as ffmpeg reports them.
 * @param {(error: EncoderError) => void} [options.onFailure] Once, if ffmpeg stops (or never starts) before `finish` or `stop`.
 * @param {typeof spawnProcess} [options.spawn]
 */
export function startVideoEncoder({ ffmpegPath, spec, outPath, onEncoded = () => {}, onFailure = () => {}, spawn = spawnProcess }) {
  const child = spawn(ffmpegPath, videoArgs(spec, outPath), { stdio: ["pipe", "pipe", "pipe"] });
  let said = "";
  let encoded = 0;
  let ending = false;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (text) => {
    said = (said + text).slice(-STDERR_KEPT);
  });
  createInterface({ input: child.stdout }).on("line", (line) => {
    const [key, value] = line.trim().split("=");
    if (key === "frame" && Number(value) !== encoded) {
      encoded = Number(value);
      onEncoded(encoded);
    }
  });
  // A write fails with EPIPE once ffmpeg has gone; its exit says why.
  child.stdin.on("error", () => {});
  const exited = new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  const failure = ({ error, code, signal }) => {
    const how = error ? `could not start (${error.message})` : signal ? `was killed (${signal})` : code === 0 ? "stopped before the last frame" : `exited with code ${code}`;
    const last = said.trim().split("\n").slice(-4).join(" | ");
    return new EncoderError(`ffmpeg ${how}${last ? `: ${last}` : ""}`);
  };
  exited.then((result) => {
    if (!ending) onFailure(failure(result));
  });

  return {
    write: (bytes) =>
      new Promise((resolve, reject) => {
        if (ending || !child.stdin.writable) {
          reject(new EncoderError("ffmpeg takes no more frames"));
          return;
        }
        child.stdin.write(bytes, (error) => (error ? reject(new EncoderError(`ffmpeg didn't take the frame: ${error.message}`)) : resolve()));
      }),
    /** Ends the clip and waits for ffmpeg to write the MP4; resolves with the frames it encoded. */
    async finish() {
      ending = true;
      child.stdin.end();
      const result = await exited;
      if (result.error || result.code !== 0) throw failure(result);
      return { encoded };
    },
    /** Kills ffmpeg if it still runs, for a job that stopped, and waits until it has gone. */
    async stop() {
      ending = true;
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      await exited;
    },
  };
}

function run(ffmpegPath, args, spawn) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"], timeout: CHECK_TIMEOUT_MS });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", (text) => (output += text));
    child.stderr.setEncoding("utf8").on("data", (text) => (output += text));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${signal ? `killed (${signal})` : `exited with code ${code}`} ${output.trim().slice(-300)}`.trim()));
    });
  });
}

/**
 * The check a worker that claims turntables makes before it claims anything: its ffmpeg runs and
 * has libx264. Resolves with ffmpeg's version line.
 */
export async function checkFfmpeg(ffmpegPath, { spawn = spawnProcess } = {}) {
  let version;
  let encoders;
  try {
    version = (await run(ffmpegPath, ["-hide_banner", "-version"], spawn)).split("\n")[0].trim();
    encoders = await run(ffmpegPath, ["-hide_banner", "-encoders"], spawn);
  } catch (error) {
    throw new Error(`ffmpeg (${ffmpegPath}) doesn't run: ${error.message}`);
  }
  if (!/\slibx264\s/.test(encoders)) throw new Error(`${version} has no libx264 encoder`);
  return version;
}
