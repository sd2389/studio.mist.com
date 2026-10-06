import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startSink } from "../../../../scripts/render-worker/sink.mjs";
import { createSinkClient, FRAME_PART_BYTES } from "./sink-client";

/** A 2 × 1 RGBA frame, every byte `value`. */
const frame = (value: number) => new Uint8ClampedArray(8).fill(value);

describe("createSinkClient, against the render worker's sink (scripts/render-worker/sink.mjs)", () => {
  it("hands over a video's frames raw and in order, each taken before the next is sent", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "sink-client-"));
    const frames: number[][] = [];
    const sink = await startSink({
      origin: "http://127.0.0.1:3000",
      model: Buffer.from("glTF"),
      outDir,
      frameSize: { width: 2, height: 1 },
      onFrameBytes: (_index: number, pixels: Buffer) => {
        frames.push([...pixels]);
      },
    });
    try {
      const client = createSinkClient({ url: sink.url, token: sink.token });
      await client.postFrame(0, frame(1));
      await client.postFrame(1, frame(2));
      expect(frames).toEqual([[...frame(1)], [...frame(2)]]);

      // The sink takes the next frame only: none skipped, none twice, and only whole frames.
      await expect(client.postFrame(3, frame(4))).rejects.toThrow(/409/);
      await expect(client.postFrame(1, frame(2))).rejects.toThrow(/409/);
      await expect(client.postFrame(2, new Uint8ClampedArray(4))).rejects.toThrow(/400/);
      // And only from the page that holds this job's token.
      await expect(createSinkClient({ url: sink.url, token: "another-job" }).postFrame(2, frame(3))).rejects.toThrow(/403/);
      expect(sink.frames).toBe(2);

      await client.postProgress(0.5, "rendering");
      expect(sink.progress).toEqual([{ progress: 0.5, stage: "rendering", at: expect.any(Number) }]);
    } finally {
      await sink.close();
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("hands over a frame larger than a part in parts, in order", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "sink-client-"));
    const parts: number[][] = [];
    const width = FRAME_PART_BYTES / 4 + 2;
    const sink = await startSink({
      origin: "http://127.0.0.1:3000",
      model: Buffer.from("glTF"),
      outDir,
      frameSize: { width, height: 1 },
      onFrameBytes: (index: number, bytes: Buffer) => {
        parts.push([index, bytes.length, bytes[0]!, bytes.at(-1)!]);
      },
    });
    try {
      const pixels = new Uint8ClampedArray(width * 4).fill(5);
      pixels[FRAME_PART_BYTES] = 6;
      await createSinkClient({ url: sink.url, token: sink.token }).postFrame(0, pixels);
      expect(parts).toEqual([[0, FRAME_PART_BYTES, 5, 5], [0, 8, 6, 5]]);
      expect(sink.frames).toBe(1);
    } finally {
      await sink.close();
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("hands over a Campaign Pack's files under their paths, and its turntables frame by frame", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "sink-client-"));
    const written: number[] = [];
    const sink = await startSink({
      origin: "http://127.0.0.1:3000",
      model: Buffer.from("glTF"),
      outDir,
      paths: true,
      videos: {
        open: async () => ({
          write: async (bytes: Buffer) => void written.push(bytes[0]!),
          finish: async () => ({ path: path.join(outDir, "video-0.mp4"), bytes: 1234, sha256: "0".repeat(64) }),
        }),
      },
    });
    try {
      const client = createSinkClient({ url: sink.url, token: sink.token });
      await client.postFile("RING-1/stills/18k-yellow-gold_front.jpg", new Blob(["jpg"], { type: "image/jpeg" }));
      const video = "RING-1/video/18k-yellow-gold_turntable_1080x1080.mp4";
      await client.startVideo(video, { width: 2, height: 1, fps: 30, frames: 2 });
      await client.postFrame(0, frame(1));
      await client.postFrame(1, frame(2));
      expect(await client.endVideo(video)).toBe(1234);

      expect(written).toEqual([1, 2]);
      expect([...sink.files.keys()]).toEqual(["RING-1/stills/18k-yellow-gold_front.jpg", video]);
      expect(sink.files.get("RING-1/stills/18k-yellow-gold_front.jpg")).toMatchObject({ bytes: 3, contentType: "image/jpeg" });
      await expect(client.endVideo(video)).rejects.toThrow(/409/);
    } finally {
      await sink.close();
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
