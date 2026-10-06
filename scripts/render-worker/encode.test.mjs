import { execFileSync, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkFfmpeg, EncoderError, startVideoEncoder, VIDEO_QUALITY, videoArgs } from "./encode.mjs";
import { writeFakeFfmpeg } from "./fake-ffmpeg.mjs";
import { SINK_TOKEN_HEADER, startSink } from "./sink.mjs";

const ORIGIN = "http://127.0.0.1:3000";
const SPEC = { width: 4, height: 2, fps: 30, quality: "high" };
const FRAME_BYTES = 4 * 2 * 4;
const frame = (fill) => Buffer.alloc(FRAME_BYTES, fill);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const has = (binary) => spawnSync(binary, ["-hide_banner", "-version"]).status === 0;

let dir;
let sink;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "encode-test-"));
});

afterEach(async () => {
  await sink?.close();
  sink = null;
  await rm(dir, { recursive: true, force: true });
});

/** The value after `flag` in ffmpeg's arguments. */
const option = (args, flag) => args[args.indexOf(flag) + 1];

describe("videoArgs", () => {
  it("encodes each quality at its CRF and preset", () => {
    expect(Object.fromEntries(["standard", "high", "max"].map((quality) => {
      const args = videoArgs({ ...SPEC, quality }, "out.mp4");
      return [quality, [option(args, "-crf"), option(args, "-preset")]];
    }))).toEqual({ standard: ["23", "medium"], high: ["20", "medium"], max: ["17", "slow"] });
    expect(Object.keys(VIDEO_QUALITY)).toEqual(["standard", "high", "max"]);
  });

  it("reads raw RGBA frames of the clip's size and rate from stdin", () => {
    const args = videoArgs({ width: 1920, height: 1080, fps: 24, quality: "high" }, "/jobs/7/out/ring.mp4");
    expect(args.slice(args.indexOf("-f"), args.indexOf("-i") + 2)).toEqual(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", "1920x1080", "-r", "24", "-i", "pipe:0"]);
    expect(args.at(-1)).toBe("/jobs/7/out/ring.mp4");
    expect(option(args, "-progress")).toBe("pipe:1");
  });

  it("makes H.264 High in yuv420p, BT.709 converted and tagged, with the index first and no audio", () => {
    const args = videoArgs(SPEC, "out.mp4");
    expect(option(args, "-vf")).toBe("scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv");
    expect([option(args, "-c:v"), option(args, "-profile:v")]).toEqual(["libx264", "high"]);
    expect([option(args, "-color_primaries"), option(args, "-color_trc"), option(args, "-colorspace"), option(args, "-color_range")]).toEqual(["bt709", "bt709", "bt709", "tv"]);
    expect(option(args, "-movflags")).toBe("+faststart");
    expect(args).toContain("-an");
  });

  it("refuses odd sizes, an unknown quality and a fractional rate", () => {
    expect(() => videoArgs({ ...SPEC, width: 1919 }, "out.mp4")).toThrow(/must be even, not 1919x2/);
    expect(() => videoArgs({ ...SPEC, quality: "ultra" }, "out.mp4")).toThrow(/no video quality "ultra"/);
    expect(() => videoArgs({ ...SPEC, fps: 29.97 }, "out.mp4")).toThrow(/whole number/);
  });
});

/** An ffmpeg whose stdin takes each write only when the test calls `take()`. */
function slowFfmpeg() {
  const fake = { taken: [], pending: null, killed: null };
  const child = new EventEmitter();
  child.stdin = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, callback) {
      fake.taken.push(Buffer.from(chunk));
      fake.pending = callback;
    },
    final(callback) {
      callback();
      // As a process does: its last progress report, then its exit once stdout is read.
      child.stdout.once("end", () => {
        child.exitCode = 0;
        child.emit("close", 0, null);
      });
      child.stdout.end(`frame=${fake.taken.length}\nprogress=end\n`);
    },
  });
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = (signal) => {
    fake.killed = signal;
    child.signalCode = signal;
    // The pipe breaks under a write ffmpeg hadn't taken.
    const callback = fake.pending;
    fake.pending = null;
    callback?.(new Error("write EPIPE"));
    child.emit("close", null, signal);
  };
  fake.take = () => {
    const callback = fake.pending;
    fake.pending = null;
    callback();
  };
  fake.spawn = (command, args) => {
    fake.command = [command, ...args];
    return child;
  };
  return fake;
}

/** POSTs a frame as the page does, resolving with the status; `done` says whether it has. */
function postFrame(index, body) {
  const request = { done: false };
  request.response = new Promise((resolve, reject) => {
    const outgoing = http.request(`${sink.url}/frames/${index}`, { method: "POST", headers: { [SINK_TOKEN_HEADER]: sink.token, Origin: ORIGIN, "Content-Length": body.length } }, (response) => {
      response.resume();
      response.on("end", () => {
        request.done = true;
        resolve(response.statusCode);
      });
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
  return request;
}

async function until(check, what) {
  for (let tries = 0; tries < 200; tries += 1) {
    if (check()) return;
    await sleep(5);
  }
  throw new Error(`timed out waiting for ${what}`);
}

describe("the frame pipe", () => {
  // The page awaits each frame's answer before it draws the next: that is the backpressure.
  it("answers a frame only once ffmpeg has taken it, and takes no other frame meanwhile", async () => {
    const ffmpeg = slowFfmpeg();
    const encoder = startVideoEncoder({ ffmpegPath: "ffmpeg", spec: SPEC, outPath: path.join(dir, "ring.mp4"), spawn: ffmpeg.spawn });
    sink = await startSink({ origin: ORIGIN, model: Buffer.from("glb"), outDir: dir, names: [], frameSize: { width: 4, height: 2 }, onFrameBytes: (_index, pixels) => encoder.write(pixels) });

    const first = postFrame(0, frame(1));
    await until(() => ffmpeg.pending, "ffmpeg's stdin to get frame 0");
    await sleep(50);
    expect(first.done).toBe(false);
    // A page that doesn't wait is refused: the sink holds one frame, never the clip.
    expect(await postFrame(1, frame(2)).response).toBe(409);
    expect(sink.frames).toBe(0);

    ffmpeg.take();
    expect(await first.response).toBe(204);
    expect(sink.frames).toBe(1);

    const second = postFrame(1, frame(2));
    await until(() => ffmpeg.pending, "ffmpeg's stdin to get frame 1");
    expect(second.done).toBe(false);
    ffmpeg.take();
    expect(await second.response).toBe(204);

    expect(ffmpeg.taken).toEqual([frame(1), frame(2)]);
    expect(await encoder.finish()).toEqual({ encoded: 2 });
    expect(ffmpeg.command.slice(0, 2)).toEqual(["ffmpeg", "-hide_banner"]);
  });

  it("stops ffmpeg for a job that stopped, and a frame waiting on it fails", async () => {
    const ffmpeg = slowFfmpeg();
    const failures = [];
    const encoder = startVideoEncoder({ ffmpegPath: "ffmpeg", spec: SPEC, outPath: path.join(dir, "ring.mp4"), spawn: ffmpeg.spawn, onFailure: (error) => failures.push(error) });
    const waiting = encoder.write(frame(1));
    await until(() => ffmpeg.pending, "ffmpeg's stdin to get the frame");
    await encoder.stop();
    expect(ffmpeg.killed).toBe("SIGKILL");
    await expect(waiting).rejects.toThrow("ffmpeg didn't take the frame: write EPIPE");
    await expect(encoder.write(frame(2))).rejects.toThrow("ffmpeg takes no more frames");
    // The job knows why it stopped: the kill is no failure of ffmpeg's.
    expect(failures).toEqual([]);
  });
});

describe("startVideoEncoder with an ffmpeg", () => {
  it("reports frames encoded as ffmpeg's progress says, and the MP4 once it is done", async () => {
    const ffmpegPath = await writeFakeFfmpeg(dir);
    const encoded = [];
    const outPath = path.join(dir, "ring.mp4");
    const encoder = startVideoEncoder({ ffmpegPath, spec: SPEC, outPath, onEncoded: (count) => encoded.push(count) });
    for (const fill of [1, 2, 3]) await encoder.write(frame(fill));
    expect(await encoder.finish()).toEqual({ encoded: 3 });
    expect(encoded.at(-1)).toBe(3);
    expect(readFileSync(outPath, "utf8")).toBe("fake mp4: 3 frames of 4x2");
    expect(JSON.parse(readFileSync(`${ffmpegPath}.json`, "utf8")).args).toEqual(videoArgs(SPEC, outPath));
  });

  it("reports an ffmpeg that dies mid-clip once, with what it said, and takes no more frames", async () => {
    const ffmpegPath = await writeFakeFfmpeg(dir, { failAfterFrames: 1 });
    const failures = [];
    const encoder = startVideoEncoder({ ffmpegPath, spec: SPEC, outPath: path.join(dir, "ring.mp4"), onFailure: (error) => failures.push(error) });
    await encoder.write(frame(1)).catch(() => {});
    await until(() => failures.length, "the failure");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toBeInstanceOf(EncoderError);
    expect(failures[0].message).toBe("ffmpeg exited with code 1: [libx264 @ 0x1] fake: out of memory | Error while encoding the stream");
    await expect(encoder.write(frame(2))).rejects.toThrow(EncoderError);
    await expect(encoder.finish()).rejects.toThrow(/exited with code 1/);
  });

  it("reports an ffmpeg that isn't there", async () => {
    const failures = [];
    const encoder = startVideoEncoder({ ffmpegPath: path.join(dir, "no-ffmpeg"), spec: SPEC, outPath: path.join(dir, "ring.mp4"), onFailure: (error) => failures.push(error) });
    await until(() => failures.length, "the failure");
    expect(failures[0].message).toMatch(/^ffmpeg could not start \(spawn .*no-ffmpeg ENOENT\)/);
    await encoder.stop();
  });

  // The real thing, where the host has it: the arguments make what ADR 0005 asks for.
  it.skipIf(!has("ffmpeg") || !has("ffprobe"))("makes an H.264 High, yuv420p, BT.709 MP4 with every frame and its index first", async () => {
    const spec = { width: 64, height: 48, fps: 24, quality: "max" };
    const outPath = path.join(dir, "ring.mp4");
    const encoder = startVideoEncoder({ ffmpegPath: "ffmpeg", spec, outPath });
    for (let index = 0; index < 5; index += 1) await encoder.write(Buffer.alloc(64 * 48 * 4, 40 * index));
    expect(await encoder.finish()).toEqual({ encoded: 5 });

    const probe = JSON.parse(execFileSync("ffprobe", [
      "-v", "error", "-select_streams", "v:0", "-count_frames", "-of", "json",
      "-show_entries", "stream=codec_name,profile,pix_fmt,width,height,color_range,color_space,color_transfer,color_primaries,nb_read_frames,r_frame_rate",
      outPath,
    ]).toString()).streams[0];
    expect(probe).toEqual({
      codec_name: "h264", profile: "High", pix_fmt: "yuv420p", width: 64, height: 48,
      color_range: "tv", color_space: "bt709", color_transfer: "bt709", color_primaries: "bt709",
      r_frame_rate: "24/1", nb_read_frames: "5",
    });
    // +faststart: the index (moov) comes before the media (mdat).
    const file = readFileSync(outPath);
    const boxes = [];
    for (let at = 0, size = 8; at + 8 <= file.length && size >= 8; at += size) {
      size = file.readUInt32BE(at);
      boxes.push(file.toString("latin1", at + 4, at + 8));
    }
    expect(boxes.indexOf("moov")).toBeGreaterThan(0);
    expect(boxes.indexOf("moov")).toBeLessThan(boxes.indexOf("mdat"));
  });
});

describe("checkFfmpeg", () => {
  it("passes an ffmpeg with libx264 and gives its version", async () => {
    expect(await checkFfmpeg(await writeFakeFfmpeg(dir))).toBe("ffmpeg version fake-9.0 Copyright (c) 2000-2026 the FFmpeg developers");
  });

  it("fails one without libx264, or none at all", async () => {
    await expect(checkFfmpeg(await writeFakeFfmpeg(dir, { encoder: "libopenh264" }))).rejects.toThrow(/has no libx264 encoder/);
    await expect(checkFfmpeg(path.join(dir, "no-ffmpeg"))).rejects.toThrow(/no-ffmpeg\) doesn't run/);
  });
});
