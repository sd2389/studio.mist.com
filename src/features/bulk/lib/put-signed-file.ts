import type { IngestUpload } from "@/lib/api/ingest";

/**
 * Headers a page can't set: the browser sends them itself, `Content-Length` from the body. The
 * upload checks the body is the length the URL signs instead.
 */
const BROWSER_SET_HEADERS = new Set(["content-length", "host", "connection"]);

/** A PUT storage refused or never answered (`status` 0: the network failed). */
export class PutFailedError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PutFailedError";
    this.status = status;
  }
}

/** The headers a page sends for a signed PUT: every one the API returned but those the browser sets. */
export function headersToSend(signed: Record<string, string>): [string, string][] {
  return Object.entries(signed).filter(([name]) => !BROWSER_SET_HEADERS.has(name.toLowerCase()));
}

/** Checks the body is the size the URL signs, which storage would refuse otherwise. */
export function assertSignedLength(signed: Record<string, string>, body: Blob): void {
  const length = Object.entries(signed).find(([name]) => name.toLowerCase() === "content-length")?.[1];
  if (length !== undefined && Number(length) !== body.size) {
    throw new PutFailedError(400, `The file is ${body.size} bytes now, not the ${length} it was when it was dropped.`);
  }
}

export type PutSignedFile = (
  upload: IngestUpload,
  body: Blob,
  onProgress: (sent: number) => void,
  signal: AbortSignal,
) => Promise<void>;

/**
 * PUTs a file straight to storage on its signed URL with exactly the headers it signs, reporting
 * the bytes sent as they go (XMLHttpRequest: fetch reports no upload progress). The body goes
 * without a type of its own, so no header but the signed ones is added.
 */
export const putSignedFile: PutSignedFile = (upload, body, onProgress, signal) => {
  assertSignedLength(upload.headers, body);
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const stop = () => request.abort();
    const settle = (failure: unknown | null) => {
      signal.removeEventListener("abort", stop);
      if (failure === null) resolve();
      else reject(failure);
    };
    request.open(upload.method, upload.url);
    for (const [name, value] of headersToSend(upload.headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(body.size);
        settle(null);
      } else {
        settle(new PutFailedError(request.status, `Storage refused the upload (${request.status}).`));
      }
    };
    request.onerror = () => settle(new PutFailedError(0, "The upload was cut off."));
    request.ontimeout = () => settle(new PutFailedError(0, "The upload timed out."));
    request.onabort = () => settle(signal.reason ?? new DOMException("The upload was stopped.", "AbortError"));
    signal.addEventListener("abort", stop, { once: true });
    request.send(body.slice(0, body.size));
  });
};
