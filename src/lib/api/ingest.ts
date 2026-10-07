/**
 * Bulk upload batches through the Next proxies under `/api/ingest` (backend/app/routers/ingest.py,
 * docs/adr/0006-bulk-pipeline.md). Types mirror backend/app/schemas/ingest.py. Starting or adding
 * to a batch needs the `bulk_pipeline` flag (404 while it is off); reading and canceling don't.
 */
import { apiGet, apiPost } from "@/lib/api/client";
import type { SceneLook } from "@/lib/api/scenes";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";
import type { SceneSettingsBuckets, SlotRole } from "@/lib/slot-materials/model-config";
import type { FinishId, LightingPresetId } from "@/stores/material-preset-store";

/** The most designs one `uploads` or `uploaded` call names (MAX_ITEMS_A_CALL). */
export const MAX_ITEMS_A_CALL = 100;
/** The most SKUs one `sku-check` names, and designs one batch request may hold (MAX_REQUEST_DESIGNS). */
export const MAX_REQUEST_DESIGNS = 1000;
/** The largest page of items or batches the API answers. */
export const MAX_PAGE_LIMIT = 100;
/** Items a batch page lists at a time (the API's default). */
export const ITEMS_PAGE_LIMIT = 50;

export const ITEM_STATUSES = [
  "awaiting_upload",
  "uploaded",
  "converting",
  "converted",
  "rendering",
  "done",
  "failed",
  "skipped",
  "canceled",
] as const;
export type IngestItemStatus = (typeof ITEM_STATUSES)[number];

export type IngestBatchStatus = "draft" | "processing" | "completed" | "completed_with_errors" | "canceled";

/** A companion of a design: an OBJ's MTL, a glTF's `.bin`. */
export type IngestFileIn = { filename: string; bytes: number };

/** One design of a create request; with a manifest it gives its files only. */
export type IngestItemIn = IngestFileIn & {
  companions?: IngestFileIn[];
  sku?: string | null;
  name?: string | null;
  category?: string | null;
  note?: string | null;
  units?: string | null;
};

export type IngestBatchCreate = {
  name: string;
  items: IngestItemIn[];
  /** The CSV manifest, UTF-8, at most 1 MB: file,sku,name,category,note,units; only file is required. */
  manifest?: string | null;
  render_plan?: Record<string, unknown> | null;
  /** One of the user's look templates, which each design's scene takes; none for the studio's default look. */
  look_template_id?: number | null;
  options?: { decimate?: "auto" | "fail"; default_category?: string };
};

/**
 * A look by slot role (backend/app/features/ingest/templates.py, ADR 0006): a material for every
 * slot of a role, a slot's own by role and name (a two-tone ring's head), and the look's lighting,
 * finish and scene settings.
 */
export type LookTemplateSpec = {
  lighting: LightingPresetId;
  finish: FinishId;
  materials: Partial<Record<SlotRole, SlotMaterialRef>>;
  slot_materials: Partial<Record<SlotRole, Record<string, SlotMaterialRef>>>;
  scene_settings: Partial<SceneSettingsBuckets>;
};

/** One of the user's saved look templates, with each material's name and the catalogue items and library materials it names. */
export type LookTemplate = {
  id: number;
  name: string;
  /** The scene it was made of, while it exists. */
  source_scene_id: number | null;
  template: LookTemplateSpec;
  labels: Record<string, string>;
  look: SceneLook;
  created_at: string;
  updated_at: string;
};

/** Why a batch can't be made: the item (its index in the request) and CSV row (the header is row 1) it is about. */
export type IngestProblem = {
  item: number | null;
  row: number | null;
  field: string;
  code: string;
  message: string;
};

export type IngestCredits = { model_credits: number; render_credits: number };

export type IngestItem = {
  id: number;
  batch_id: number;
  position: number;
  /** Its relative path, as dropped. */
  filename: string;
  bytes: number;
  companions: IngestFileIn[];
  sku: string;
  name: string;
  category: string;
  note: string | null;
  units: string;
  status: IngestItemStatus;
  error: string | null;
  error_code: string | null;
  attempts: number;
  scene_id: number | null;
  convert_job_id: number | null;
  model_credit_held: number;
  render_credits_held: number;
  polygon_count: number | null;
  size_mm: number | null;
  warnings: string[];
  created_at: string;
  updated_at: string;
};

export type IngestBatch = {
  id: number;
  name: string;
  status: IngestBatchStatus;
  source: string;
  item_count: number;
  total_bytes: number;
  /** Designs at each status; a status none is at is left out. */
  counts: Partial<Record<IngestItemStatus, number>>;
  render_plan: Record<string, unknown> | null;
  /** The look template its designs' scenes take, as it was when the batch was made. */
  look_template: LookTemplateSpec | null;
  options: Record<string, unknown>;
  /** What the whole batch costs: a model credit and the render plan's credits for each design. */
  quote: IngestCredits;
  /** What its designs hold now, not yet spent or given back. */
  held: IngestCredits;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  finished_at: string | null;
  expires_at: string | null;
};

export type IngestBatchCreated = IngestBatch & { items: IngestItem[] };

export type IngestPage<T> = { items: T[]; total: number; page: number; limit: number };

/** A batch and the page of its designs on show. */
export type BatchView = { batch: IngestBatch; items: IngestPage<IngestItem> };

/** One signed PUT: send the file with exactly these headers, which the URL signs. */
export type IngestUpload = {
  item_id: number;
  /** As the item names it: its CAD file's or a companion's relative path. */
  filename: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
};

export type IngestUploads = { files: IngestUpload[]; expires_in: number };

/** The designs confirmed, and those whose files aren't all stored at their declared sizes yet. */
export type IngestUploaded = {
  items: IngestItem[];
  missing: { item_id: number; message: string }[];
};

export type IngestRefusal = { item_id: number; code: string; message: string };

export type IngestRetried = { batch: IngestBatch; retried: number[]; refused: IngestRefusal[] };

/** The SKUs a scene holds, and those a design in progress reserves; the others are free. */
export type IngestSkuCheck = { taken: string[]; reserved: string[] };

type CallOptions = { signal?: AbortSignal };

function batchPath(batchId: number, rest = ""): string {
  return `/api/ingest/batches/${batchId}${rest}`;
}

/**
 * Makes a draft batch, every design awaiting its upload: 201, or 200 with the batch an earlier
 * request with the same `idempotencyKey` and body made. A batch with problems is a 422 whose
 * `problems` (`batchProblems`) name each design and CSV row; 402 when the plan can't take it,
 * 429 when the owner has as many batches open as they may.
 */
export function createBatch(
  body: IngestBatchCreate,
  { idempotencyKey = crypto.randomUUID(), signal }: CallOptions & { idempotencyKey?: string } = {},
): Promise<IngestBatchCreated> {
  return apiPost<IngestBatchCreated>("/api/ingest/batches", body, {
    headers: { "Idempotency-Key": idempotencyKey },
    signal,
  });
}

/** The problems a refused create listed; empty for any other error. */
export function batchProblems(error: unknown): IngestProblem[] {
  if (!(error instanceof AuthRequestError) || error.status !== 422) return [];
  const problems = (error.body as { problems?: unknown } | null)?.problems;
  return Array.isArray(problems) ? (problems as IngestProblem[]) : [];
}

export function listBatches(
  { page = 1, limit = 20 }: { page?: number; limit?: number } = {},
  { signal }: CallOptions = {},
): Promise<IngestPage<IngestBatch>> {
  return apiGet<IngestPage<IngestBatch>>(`/api/ingest/batches?page=${page}&limit=${limit}`, { signal });
}

export function getBatch(batchId: number, { signal }: CallOptions = {}): Promise<IngestBatch> {
  return apiGet<IngestBatch>(batchPath(batchId), { signal });
}

export type BatchItemsQuery = { status?: IngestItemStatus | null; page?: number; limit?: number };

/** The query `GET …/items` takes: only what is set. */
export function batchItemsSearch({ status, page = 1, limit = ITEMS_PAGE_LIMIT }: BatchItemsQuery): string {
  const search = new URLSearchParams();
  if (status) search.set("status", status);
  if (page > 1) search.set("page", String(page));
  search.set("limit", String(limit));
  return `?${search.toString()}`;
}

/** One page of a batch's designs, in the order they were dropped, of one status if asked. */
export function listBatchItems(
  batchId: number,
  query: BatchItemsQuery = {},
  { signal }: CallOptions = {},
): Promise<IngestPage<IngestItem>> {
  return apiGet<IngestPage<IngestItem>>(batchPath(batchId, `/items${batchItemsSearch(query)}`), { signal });
}

/** Every design of a batch at one status, read 100 at a time. */
export async function listAllBatchItems(
  batchId: number,
  status: IngestItemStatus,
  { signal }: CallOptions = {},
): Promise<IngestItem[]> {
  const items: IngestItem[] = [];
  for (let page = 1; ; page += 1) {
    const answer = await listBatchItems(batchId, { status, page, limit: MAX_PAGE_LIMIT }, { signal });
    items.push(...answer.items);
    if (answer.items.length === 0 || items.length >= answer.total) return items;
  }
}

/** Which SKUs a scene holds or a design in progress reserves (at most 1000 a call). */
export function checkSkus(skus: string[], { signal }: CallOptions = {}): Promise<IngestSkuCheck> {
  return apiPost<IngestSkuCheck>("/api/ingest/sku-check", { skus }, { signal });
}

/** A signed PUT for each file of these designs (at most 100), all awaiting their uploads. */
export function signUploads(batchId: number, itemIds: number[], { signal }: CallOptions = {}): Promise<IngestUploads> {
  return apiPost<IngestUploads>(batchPath(batchId, "/uploads"), { item_ids: itemIds }, { signal });
}

/** Confirms these designs' files are stored at their declared sizes (at most 100 a call). */
export function confirmUploads(batchId: number, itemIds: number[], { signal }: CallOptions = {}): Promise<IngestUploaded> {
  return apiPost<IngestUploaded>(batchPath(batchId, "/uploaded"), { item_ids: itemIds }, { signal });
}

/** Holds the batch's credits and starts converting its uploaded designs (402 when short). */
export function submitBatch(batchId: number): Promise<IngestBatch> {
  return apiPost<IngestBatch>(batchPath(batchId, "/submit"), {});
}

/** Converts every failed design again, holding its credits again; says which it couldn't. */
export function retryFailedItems(batchId: number): Promise<IngestRetried> {
  return apiPost<IngestRetried>(batchPath(batchId, "/retry-failed"), {});
}

export function retryItem(batchId: number, itemId: number): Promise<IngestItem> {
  return apiPost<IngestItem>(batchPath(batchId, `/items/${itemId}/retry`), {});
}

/** Cancels what hasn't finished and gives its credits back; works with the flag off too. */
export function cancelBatch(batchId: number): Promise<IngestBatch> {
  return apiPost<IngestBatch>(batchPath(batchId, "/cancel"), {});
}

/**
 * A look template of one of the user's scenes, as its look is now: a new one, or that scene's
 * template brought up to date. 404 for a scene that isn't theirs; 400 when its look can't be one.
 */
export function lookTemplateFromScene(sceneId: number): Promise<LookTemplate> {
  return apiPost<LookTemplate>(`/api/ingest/look-templates/from-scene/${sceneId}`, {});
}
