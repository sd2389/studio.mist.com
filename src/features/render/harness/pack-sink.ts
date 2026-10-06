import type { TurntableJob } from "../campaign-pack/domain/types";
import type { PackVideoEncoder } from "../campaign-pack/engine/pack-backend";
import type { PackFileWriter } from "../campaign-pack/engine/runner";
import type { PackEntry } from "./job-payload";
import { createPixelReader } from "./render-frames";
import type { SinkClient } from "./sink-client";

/** A pack's documents by extension: the worker deflates text in the ZIP and stores media as it comes. */
const DOCUMENT_TYPES: Record<string, string> = { html: "text/html", md: "text/markdown", json: "application/json" };

function documentType(path: string): string {
  return DOCUMENT_TYPES[path.split(".").pop() ?? ""] ?? "text/plain";
}

/**
 * Where a Campaign Pack's page writes its ZIP (ADR 0005, D2): each file to the worker's sink as
 * it is made, under its path in the ZIP, and each turntable as raw frames for the worker's ffmpeg,
 * which stores the MP4 under its path. `entries` lists them in the order they went: the ZIP's.
 */
export type PackSink = PackFileWriter & {
  openVideo(job: TurntableJob): Promise<PackVideoEncoder>;
  readonly entries: PackEntry[];
};

/**
 * The pack's writer on the sink. Whatever the sink refuses, and a turntable that stops before its
 * last frame, stops the pack through `onFailure`, the job being tried again whole: a part the
 * worker can't take is not a part to leave out, as one the page couldn't render is.
 */
export function createPackSink(sink: SinkClient, onFailure: (error: unknown) => void): PackSink {
  const entries: PackEntry[] = [];
  const guard = async <T>(call: Promise<T>): Promise<T> => {
    try {
      return await call;
    } catch (error) {
      onFailure(error);
      throw error;
    }
  };
  return {
    entries,
    async add(path, data) {
      const file = typeof data === "string" ? new Blob([data], { type: documentType(path) }) : data;
      await guard(sink.postFile(path, file));
      entries.push({ path, content_type: file.type });
      return file.size;
    },
    async openVideo({ path, width, height, fps, frameCount }) {
      await guard(sink.startVideo(path, { width, height, fps, frames: frameCount }));
      const readPixels = createPixelReader(width, height);
      return {
        // Read before anything is awaited: the next render replaces the frame.
        addFrame: (frame, index) => guard(sink.postFrame(index, readPixels(frame))),
        async finish() {
          const bytes = await guard(sink.endVideo(path));
          entries.push({ path, content_type: "video/mp4" });
          return bytes;
        },
        // The worker can't keep half a turntable: the job goes again.
        cancel: async (reason) => onFailure(reason ?? new Error(`${path} stopped before its last frame.`)),
      };
    },
  };
}
