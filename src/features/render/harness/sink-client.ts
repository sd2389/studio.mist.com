import { SINK_TOKEN_HEADER, type RenderStage, type SinkAddress } from "./job-payload";

/** One of a Campaign Pack's turntables, as its page opens it: its frames' size, its rate and how many. */
export type VideoClip = { width: number; height: number; fps: number; frames: number };

export type SinkClient = {
  /** The job's model, as the worker downloaded it. */
  fetchModel(): Promise<Blob>;
  /**
   * Hands over one encoded file, under its name: a Campaign Pack's are paths in its ZIP. Resolves
   * once the worker has it, so the next one waits (backpressure).
   */
  postFile(name: string, file: Blob): Promise<void>;
  /**
   * Hands over frame `index` of a video as raw RGBA, frames in order from 0, in parts of at most
   * `FRAME_PART_BYTES`, each sent once the worker has the one before. Resolves once it has the last.
   */
  postFrame(index: number, pixels: Uint8ClampedArray<ArrayBuffer>): Promise<void>;
  /**
   * Opens one of a Campaign Pack's turntables, `name` being its MP4's path in the pack's ZIP; its
   * frames then go by `postFrame`, from 0. One at a time.
   */
  startVideo(name: string, clip: VideoClip): Promise<void>;
  /** Closes the open turntable once all its frames are in; resolves with the size of the MP4 the worker made of them. */
  endVideo(name: string): Promise<number>;
  postProgress(progress: number, stage: RenderStage): Promise<void>;
};

type SinkRequest = { method?: "GET" | "POST"; body?: BodyInit; headers?: Record<string, string> };

/**
 * A frame goes to the sink in parts of at most this many bytes, each as a Blob. The worker's
 * browser hands every request body it intercepts to the worker over DevTools, as text: a whole
 * 8K frame (133 MB) would make a message too large for the worker to read. A Blob body also
 * stays out of the request events DevTools sends, which copy an array's bytes.
 */
export const FRAME_PART_BYTES = 16 * 1024 * 1024;

const json = (body: unknown) => ({ body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

/**
 * The page's side of the worker's loopback sink (ADR 0005): `GET /inputs/model.glb`,
 * `POST /files/<name>`, `POST /frames/<n>`, `POST /videos/<name>` and `POST /videos/<name>/end`
 * (a Campaign Pack's turntables) and `POST /progress`, each with the job's sink token in a header.
 */
export function createSinkClient({ url, token }: SinkAddress): SinkClient {
  const base = url.replace(/\/+$/, "");
  const send = async (path: string, init: SinkRequest = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      cache: "no-store",
      headers: { ...init.headers, [SINK_TOKEN_HEADER]: token },
    });
    if (!response.ok) throw new Error(`sink ${init.method ?? "GET"} ${path}: ${response.status}`);
    return response;
  };
  return {
    fetchModel: async () => (await send("/inputs/model.glb")).blob(),
    async postFile(name, file) {
      await send(`/files/${encodeURIComponent(name)}`, {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
    },
    async postFrame(index, pixels) {
      const length = pixels.byteLength;
      for (let offset = 0; offset < length; offset += FRAME_PART_BYTES) {
        const part = pixels.subarray(offset, Math.min(offset + FRAME_PART_BYTES, length));
        await send(`/frames/${index}?offset=${offset}&length=${length}`, {
          method: "POST",
          body: new Blob([part]),
          headers: { "Content-Type": "application/octet-stream" },
        });
      }
    },
    async startVideo(name, clip) {
      await send(`/videos/${encodeURIComponent(name)}`, { method: "POST", ...json(clip) });
    },
    async endVideo(name) {
      const response = await send(`/videos/${encodeURIComponent(name)}/end`, { method: "POST" });
      const { bytes } = (await response.json()) as { bytes: number };
      return bytes;
    },
    async postProgress(progress, stage) {
      await send("/progress", { method: "POST", ...json({ progress, stage }) });
    },
  };
}
