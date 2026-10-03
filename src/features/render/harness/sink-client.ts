import { SINK_TOKEN_HEADER, type RenderStage, type SinkAddress } from "./job-payload";

export type SinkClient = {
  /** The job's model, as the worker downloaded it. */
  fetchModel(): Promise<Blob>;
  /** Hands over one encoded file. Resolves once the worker has it, so the next one waits (backpressure). */
  postFile(name: string, file: Blob): Promise<void>;
  postProgress(progress: number, stage: RenderStage): Promise<void>;
};

type SinkRequest = { method?: "GET" | "POST"; body?: BodyInit; headers?: Record<string, string> };

/**
 * The page's side of the worker's loopback sink (ADR 0005): `GET /inputs/model.glb`,
 * `POST /files/<name>` and `POST /progress`, each with the job's sink token in a header.
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
    async postProgress(progress, stage) {
      await send("/progress", {
        method: "POST",
        body: JSON.stringify({ progress, stage }),
        headers: { "Content-Type": "application/json" },
      });
    },
  };
}
