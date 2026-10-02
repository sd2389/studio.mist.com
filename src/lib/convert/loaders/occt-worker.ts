/**
 * OpenCascade (occt-import-js) in a Web Worker, fetched lazily from a pinned jsDelivr build the
 * same way rhino3dm is — the ~7.6 MB WASM never touches the main bundle and is downloaded once
 * per page session. The worker is built from a Blob (cross-origin worker URLs are not allowed)
 * and receives the WASM bytes directly, so it makes no network requests of its own.
 */

export const OCCT_VERSION = "0.0.23";
export const OCCT_BASE_URL = `https://cdn.jsdelivr.net/npm/occt-import-js@${OCCT_VERSION}/dist/`;

export type OcctFormat = "step" | "iges";

export type OcctMesh = {
  name?: string;
  color?: [number, number, number];
  attributes: { position: { array: Float32Array }; normal?: { array: Float32Array } };
  index: { array: Uint32Array };
};

export type OcctNode = { name?: string; meshes?: number[]; children?: OcctNode[] };

export type OcctResult = { success: boolean; root?: OcctNode; meshes?: OcctMesh[] };

export type OcctParams = {
  linearUnit: "millimeter";
  linearDeflectionType: "bounding_box_ratio";
  linearDeflection: number;
  angularDeflection: number;
};

type WorkerReply = { id: number; result?: OcctResult; error?: string };

/** Runs inside the worker after the occt-import-js glue, which defines `occtimportjs`. */
const WORKER_HANDLER = `
let occtReady = null;
self.onmessage = async (event) => {
  const { id, wasmBinary, format, buffer, params } = event.data;
  try {
    if (!occtReady) occtReady = occtimportjs({ wasmBinary });
    const occt = await occtReady;
    const result = occt.ReadFile(format, new Uint8Array(buffer), params);
    const transfer = [];
    for (const mesh of result.meshes || []) {
      mesh.attributes.position.array = new Float32Array(mesh.attributes.position.array);
      transfer.push(mesh.attributes.position.array.buffer);
      if (mesh.attributes.normal) {
        mesh.attributes.normal.array = new Float32Array(mesh.attributes.normal.array);
        transfer.push(mesh.attributes.normal.array.buffer);
      }
      mesh.index.array = new Uint32Array(mesh.index.array);
      transfer.push(mesh.index.array.buffer);
      delete mesh.brep_faces;
    }
    self.postMessage({ id, result }, transfer);
  } catch (error) {
    occtReady = null;
    self.postMessage({ id, error: String((error && error.message) || error) });
  }
};
`;

export type DownloadProgress = (fraction: number) => void;

/**
 * Decompressed size of the pinned WASM. jsDelivr serves it brotli-encoded, so content-length
 * is the compressed size while the body stream yields decompressed bytes.
 */
const OCCT_WASM_BYTES = 7_604_031;

async function fetchWithProgress(url: string, onProgress: DownloadProgress): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Could not download the CAD kernel (${response.status})`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(received / OCCT_WASM_BYTES, 1));
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes.buffer;
}

type OcctWorker = { read: (format: OcctFormat, buffer: ArrayBuffer, params: OcctParams) => Promise<OcctResult> };

async function createOcctWorker(onProgress: DownloadProgress): Promise<OcctWorker> {
  const [glue, wasmBinary] = await Promise.all([
    fetch(`${OCCT_BASE_URL}occt-import-js.js`).then((response) => {
      if (!response.ok) throw new Error(`Could not download the CAD kernel (${response.status})`);
      return response.text();
    }),
    fetchWithProgress(`${OCCT_BASE_URL}occt-import-js.wasm`, onProgress),
  ]);
  const source = URL.createObjectURL(new Blob([glue, "\n", WORKER_HANDLER], { type: "text/javascript" }));
  const worker = new Worker(source);
  URL.revokeObjectURL(source);
  const pending = new Map<number, { resolve: (result: OcctResult) => void; reject: (error: Error) => void }>();
  let nextId = 1;
  let wasmSent = false;
  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const { id, result, error } = event.data;
    const entry = pending.get(id);
    pending.delete(id);
    if (!entry) return;
    if (result) entry.resolve(result);
    else entry.reject(new Error(error ?? "CAD conversion failed"));
  };
  worker.onerror = (event) => {
    for (const entry of pending.values()) entry.reject(new Error(event.message || "CAD kernel crashed"));
    pending.clear();
  };
  return {
    read: (format, buffer, params) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        const message = { id, format, buffer, params, wasmBinary: wasmSent ? undefined : wasmBinary };
        wasmSent = true;
        worker.postMessage(message, [buffer]);
      }),
  };
}

let workerPromise: Promise<OcctWorker> | null = null;
const progressListeners = new Set<DownloadProgress>();

/** The shared worker; the first caller triggers the download, later callers reuse it. */
export function getOcctWorker(onProgress: DownloadProgress): Promise<OcctWorker> {
  progressListeners.add(onProgress);
  if (!workerPromise) {
    workerPromise = createOcctWorker((fraction) => progressListeners.forEach((listener) => listener(fraction)));
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise.finally(() => progressListeners.delete(onProgress));
}
