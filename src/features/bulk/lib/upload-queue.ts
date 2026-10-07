/**
 * A batch's files, straight from the browser to storage (docs/adr/0006-bulk-pipeline.md,
 * "Uploading in bulk"): designs signed a group at a time, four PUTs at a time with exactly the
 * headers each URL signs, transient failures tried again with backoff, and stored designs
 * confirmed with `uploaded` in groups. A design that can't upload fails alone and stays
 * awaiting its upload, to be sent again later.
 */
import { signUploads, confirmUploads, MAX_ITEMS_A_CALL } from "@/lib/api/ingest";
import type { IngestItem, IngestUpload, IngestUploaded, IngestUploads } from "@/lib/api/ingest";
import { isRefusal, waitFor } from "@/lib/polling";
import { baseName } from "@/lib/upload/dropped-files";
import type { DesignUpload } from "../domain/batch-request";
import { PutFailedError, type PutSignedFile } from "./put-signed-file";

/** Four signed PUTs at a time. */
export const UPLOAD_CONCURRENCY = 4;
/** Designs signed in one call: 500 designs take 20, and each URL is used soon after it is signed. */
export const SIGN_CHUNK = 25;
/** Designs confirmed in one call, at most; a stored design waits at most CONFIRM_WAIT_MS for others. */
export const CONFIRM_CHUNK = 25;
export const CONFIRM_WAIT_MS = 5000;
/** The waits before each retry of a transient failure. */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000];
/** A signed URL is used only while it has this long left; an older one is signed again. */
const SIGNATURE_MARGIN_MS = 60_000;

export type UploadApi = {
  sign: (itemIds: number[], signal: AbortSignal) => Promise<IngestUploads>;
  confirm: (itemIds: number[], signal: AbortSignal) => Promise<IngestUploaded>;
};

/** The batch's own `uploads` and `uploaded`. */
export function batchUploadApi(batchId: number): UploadApi {
  return {
    sign: (itemIds, signal) => signUploads(batchId, itemIds, { signal }),
    confirm: (itemIds, signal) => confirmUploads(batchId, itemIds, { signal }),
  };
}

export type UploadEvents = {
  /** Bytes of a design sent so far, every file of it. */
  onProgress?: (itemId: number, sent: number) => void;
  /** Every file of a design is stored; its confirmation is on its way. */
  onStored?: (itemId: number) => void;
  /** A design the API confirmed: uploaded, or converting in a submitted batch. */
  onConfirmed?: (item: IngestItem) => void;
  /** A design that didn't upload, and why; it stays awaiting its upload. */
  onFailed?: (itemId: number, message: string) => void;
};

export type UploadOptions = UploadEvents & {
  api: UploadApi;
  put: PutSignedFile;
  /** Stops every upload: leaving the page pauses the batch. */
  signal: AbortSignal;
  concurrency?: number;
  signChunk?: number;
  confirmChunk?: number;
  confirmWaitMs?: number;
  retryDelaysMs?: readonly number[];
  now?: () => number;
};

export type UploadSummary = { confirmed: number[]; failed: number[] };

type Settings = Required<Omit<UploadOptions, "onProgress" | "onStored">> & Pick<UploadEvents, "onProgress" | "onStored">;

/** Worth trying again: the network, a timeout, a rate limit or a server error; not a refusal. */
export function isTransientFailure(error: unknown): boolean {
  if (error instanceof PutFailedError) {
    return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return !isRefusal(error);
}

function failureMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "The upload failed.";
}

async function withRetries<T>(attempt: () => Promise<T>, settings: Settings): Promise<T> {
  for (let tried = 0; ; tried += 1) {
    try {
      return await attempt();
    } catch (error) {
      settings.signal.throwIfAborted();
      if (tried >= settings.retryDelaysMs.length || !isTransientFailure(error)) throw error;
      await waitFor(settings.retryDelaysMs[tried], settings.signal);
    }
  }
}

type PendingSignature = { call: Promise<void>; size: number };

/** Signed PUTs by design, signed a group at a time and again once they near their expiry. */
class Signatures {
  private readonly signed = new Map<number, { files: IngestUpload[]; usableUntil: number }>();
  private readonly pending = new Map<number, PendingSignature>();

  constructor(private readonly settings: Settings) {}

  /** A design's signed PUTs; signed with the designs after it in one call when it has none fresh. */
  async filesFor(design: DesignUpload, upcoming: DesignUpload[]): Promise<IngestUpload[]> {
    if (!this.isFresh(design.itemId)) {
      const pending = this.pending.get(design.itemId) ?? this.sign([design, ...upcoming]);
      try {
        await pending.call;
      } catch (error) {
        // One design can get a whole call refused (409: it isn't awaiting its upload): ask alone.
        if (pending.size === 1 || !isRefusal(error)) throw error;
        await this.sign([design]).call;
      }
    }
    return this.signed.get(design.itemId)?.files ?? [];
  }

  /** Signs again, at once: storage refused the URL it had. */
  forget(itemId: number) {
    this.signed.delete(itemId);
  }

  private isFresh(itemId: number): boolean {
    return (this.signed.get(itemId)?.usableUntil ?? 0) > this.settings.now();
  }

  private sign(designs: DesignUpload[]): PendingSignature {
    const ids = designs
      .map((design) => design.itemId)
      .filter((id, index) => index === 0 || (!this.isFresh(id) && !this.pending.has(id)))
      .slice(0, Math.min(this.settings.signChunk, MAX_ITEMS_A_CALL));
    const call = withRetries(() => this.settings.api.sign(ids, this.settings.signal), this.settings).then((answer) => {
      const usableUntil = this.settings.now() + answer.expires_in * 1000 - SIGNATURE_MARGIN_MS;
      for (const id of ids) {
        this.signed.set(id, { files: answer.files.filter((file) => file.item_id === id), usableUntil });
      }
    });
    const pending = { call, size: ids.length };
    for (const id of ids) this.pending.set(id, pending);
    const settled = () => {
      for (const id of ids) if (this.pending.get(id) === pending) this.pending.delete(id);
    };
    call.then(settled, settled);
    return pending;
  }
}

/** Stored designs, confirmed in groups: when a group fills, or CONFIRM_WAIT_MS after its first. */
class Confirmations {
  private waiting: number[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly settings: Settings) {}

  add(itemId: number) {
    this.waiting.push(itemId);
    if (this.waiting.length >= this.settings.confirmChunk) void this.flush();
    else this.timer ??= setTimeout(() => void this.flush(), this.settings.confirmWaitMs);
  }

  /** Confirms every design waiting; calls go one at a time. */
  flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ids = this.waiting.splice(0);
    if (ids.length > 0) this.queue = this.queue.then(() => this.confirm(ids));
    return this.queue;
  }

  private async confirm(ids: number[]) {
    const { api, signal, onConfirmed, onFailed } = this.settings;
    for (let start = 0; start < ids.length; start += MAX_ITEMS_A_CALL) {
      const group = ids.slice(start, start + MAX_ITEMS_A_CALL);
      try {
        const answer = await withRetries(() => api.confirm(group, signal), this.settings);
        const missing = new Map(answer.missing.map((file) => [file.item_id, file.message]));
        for (const item of answer.items) {
          const message = missing.get(item.id);
          if (message !== undefined) onFailed(item.id, message);
          else onConfirmed(item);
        }
      } catch (error) {
        // Paused: the designs stay awaiting their uploads, and go up again when the batch resumes.
        if (signal.aborted) return;
        for (const id of group) onFailed(id, failureMessage(error));
      }
    }
  }
}

/** PUTs one file, signing the design again once if storage refuses its URL (403: most often expired). */
async function putFile(
  design: DesignUpload,
  index: number,
  signatures: Signatures,
  sent: (bytes: number) => void,
  settings: Settings,
) {
  const { path, file } = design.files[index];
  let resigned = false;
  for (let tried = 0; ; tried += 1) {
    const upload = (await signatures.filesFor(design, [])).find((signed) => signed.filename === path);
    if (!upload) throw new Error(`The API signed no upload for ${baseName(path)}.`);
    // Nothing more starts once the page is left.
    settings.signal.throwIfAborted();
    try {
      await settings.put(upload, file, sent, settings.signal);
      return;
    } catch (error) {
      settings.signal.throwIfAborted();
      sent(0);
      if (error instanceof PutFailedError && error.status === 403 && !resigned) {
        resigned = true;
        signatures.forget(design.itemId);
        continue;
      }
      if (tried >= settings.retryDelaysMs.length || !isTransientFailure(error)) throw error;
      await waitFor(settings.retryDelaysMs[tried], settings.signal);
    }
  }
}

async function uploadDesign(design: DesignUpload, upcoming: DesignUpload[], signatures: Signatures, settings: Settings) {
  // Signed with the designs queued after it, so the next ones are ready when their turn comes.
  await signatures.filesFor(design, upcoming);
  const sent = design.files.map(() => 0);
  for (const index of design.files.keys()) {
    await putFile(
      design,
      index,
      signatures,
      (bytes) => {
        sent[index] = bytes;
        settings.onProgress?.(design.itemId, sent.reduce((total, part) => total + part, 0));
      },
      settings,
    );
  }
}

/**
 * Uploads designs in order, `concurrency` at a time, each design's files one after another, and
 * confirms them as they are stored. Resolves once every design is confirmed or has failed;
 * rejects when `signal` aborts, leaving the rest awaiting their uploads.
 */
export async function uploadDesigns(designs: DesignUpload[], options: UploadOptions): Promise<UploadSummary> {
  const summary: UploadSummary = { confirmed: [], failed: [] };
  const settings: Settings = {
    concurrency: UPLOAD_CONCURRENCY,
    signChunk: SIGN_CHUNK,
    confirmChunk: CONFIRM_CHUNK,
    confirmWaitMs: CONFIRM_WAIT_MS,
    retryDelaysMs: RETRY_DELAYS_MS,
    now: Date.now,
    ...options,
    onConfirmed: (item) => {
      summary.confirmed.push(item.id);
      options.onConfirmed?.(item);
    },
    onFailed: (itemId, message) => {
      summary.failed.push(itemId);
      options.onFailed?.(itemId, message);
    },
  };
  const queue = [...designs];
  const signatures = new Signatures(settings);
  const confirmations = new Confirmations(settings);

  const work = async () => {
    for (let design = queue.shift(); design; design = queue.shift()) {
      try {
        await uploadDesign(design, queue, signatures, settings);
      } catch (error) {
        settings.signal.throwIfAborted();
        settings.onFailed(design.itemId, failureMessage(error));
        continue;
      }
      settings.onStored?.(design.itemId);
      confirmations.add(design.itemId);
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(settings.concurrency, designs.length) }, work));
  } finally {
    await confirmations.flush();
  }
  return summary;
}
