import { describe, expect, it } from "vitest";
import { startSink } from "../../../../scripts/golden/sink.mjs";
import { createSinkClient } from "./sink-client";

/** A 2 × 1 RGBA frame, every byte `value`. */
const frame = (value: number) => new Uint8ClampedArray(8).fill(value);

describe("createSinkClient, against the reference sink (scripts/golden/sink.mjs)", () => {
  it("hands over a video's frames raw and in order, each taken before the next is sent", async () => {
    const sink = await startSink({ model: Buffer.from("glTF"), origin: "http://127.0.0.1:3000", frameSize: { width: 2, height: 1 } });
    try {
      const client = createSinkClient({ url: sink.url, token: sink.token });
      await client.postFrame(0, frame(1));
      await client.postFrame(1, frame(2));
      expect(sink.frames.map((body: Buffer) => [...body])).toEqual([[...frame(1)], [...frame(2)]]);

      // The sink takes the next frame only: none skipped, none twice, and only whole frames.
      await expect(client.postFrame(3, frame(4))).rejects.toThrow(/409/);
      await expect(client.postFrame(1, frame(2))).rejects.toThrow(/409/);
      await expect(client.postFrame(2, new Uint8ClampedArray(4))).rejects.toThrow(/400/);
      // And only from the page that holds this job's token.
      await expect(createSinkClient({ url: sink.url, token: "another-job" }).postFrame(2, frame(3))).rejects.toThrow(/403/);
      expect(sink.frames).toHaveLength(2);

      await client.postProgress(0.5, "rendering");
      expect(sink.progress).toEqual([{ progress: 0.5, stage: "rendering" }]);
    } finally {
      await sink.close();
    }
  });
});
