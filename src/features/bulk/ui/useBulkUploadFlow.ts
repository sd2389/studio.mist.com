"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  batchProblems,
  createBatch,
  submitBatch,
  type IngestBatchCreated,
  type IngestProblem,
  type IngestSkuCheck,
} from "@/lib/api/ingest";
import { AuthRequestError } from "@/lib/auth/is-auth-required-error";
import { batchCreateBody, designUploads, type DesignUpload } from "../domain/batch-request";
import { heldSkuProblems, withoutProblems } from "../domain/design-checks";
import { useBatchUploads } from "./useBatchUploads";
import type { BulkDrop } from "./useBulkDrop";

export type FlowPhase = "planning" | "creating" | "uploading" | "uploaded" | "submitting";

/** The API's 402 (the plan can't take it, or credits are short) or 429 (too many batches open). */
export type Refusal = { status: 402 | 429; message: string };

export function defaultBatchName(designs: number): string {
  return `Bulk upload of ${designs} design${designs === 1 ? "" : "s"}`;
}

function messageOf(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message ? failure.message : fallback;
}

function refusalOf(failure: unknown): Refusal | null {
  if (failure instanceof AuthRequestError && (failure.status === 402 || failure.status === 429)) {
    return { status: failure.status, message: failure.message };
  }
  return null;
}

/**
 * The bulk upload page's steps once its files are dropped: make the batch (one Idempotency-Key
 * per request body, so trying again after a lost answer finds the same batch), upload every
 * design straight to storage, and submit once all of them are up. The API's problems replace
 * the checks made before it while the request is the one they are about.
 */
export function useBulkUploadFlow(drop: BulkDrop, held: IngestSkuCheck | null) {
  const router = useRouter();
  const uploads = useBatchUploads();
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<FlowPhase>("planning");
  const [batch, setBatch] = useState<IngestBatchCreated | null>(null);
  const [apiProblems, setApiProblems] = useState<{ body: string; problems: IngestProblem[] } | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ body: string; idempotencyKey: string } | null>(null);

  const { plan } = drop;
  const batchName = name.trim() || defaultBatchName(plan.designs.length);
  const body = useMemo(
    () =>
      batchCreateBody(plan.designs, {
        name: batchName,
        manifest: drop.manifest?.text ?? null,
        defaultCategory: drop.defaultCategory,
      }),
    [plan.designs, batchName, drop.manifest, drop.defaultCategory],
  );
  const bodyKey = useMemo(() => JSON.stringify(body), [body]);
  // What the checks here find: they keep the batch from being made.
  const localProblems = useMemo(() => {
    const skuProblems = held ? heldSkuProblems(withoutProblems(plan.designs, plan.problems), held) : [];
    return [...plan.problems, ...skuProblems];
  }, [held, plan]);
  // What the API found shows instead, while the request is the one it refused; it can be made
  // again as it is, once what the API found is fixed elsewhere (another batch canceled).
  const refusedBody = apiProblems?.body === bodyKey;
  const problems = refusedBody ? apiProblems.problems : localProblems;

  function showFailure(failure: unknown, fallback: string) {
    const listed = batchProblems(failure);
    if (listed.length > 0) setApiProblems({ body: bodyKey, problems: listed });
    else if (refusalOf(failure)) setRefusal(refusalOf(failure));
    else setError(messageOf(failure, fallback));
  }

  async function submit(batchId: number) {
    setPhase("submitting");
    setRefusal(null);
    setError(null);
    try {
      await submitBatch(batchId);
      router.push(`/bulk/${batchId}`);
    } catch (failure) {
      setPhase("uploaded");
      showFailure(failure, "The batch couldn't be submitted");
    }
  }

  async function uploadAndSubmit(made: IngestBatchCreated, designs: DesignUpload[]) {
    setPhase("uploading");
    setError(null);
    let summary;
    try {
      summary = await uploads.start(made.id, designs);
    } catch (failure) {
      setPhase("uploaded");
      setError(messageOf(failure, "The uploads stopped"));
      return;
    }
    if (summary === null) return; // the page was left: the batch waits as a draft
    if (summary.failed.length > 0) setPhase("uploaded");
    else await submit(made.id);
  }

  /** Makes the batch and uploads it; with problems nothing is made, and they show where they belong. */
  async function start() {
    setRefusal(null);
    setError(null);
    const idempotencyKey = attempt.current?.body === bodyKey ? attempt.current.idempotencyKey : crypto.randomUUID();
    attempt.current = { body: bodyKey, idempotencyKey };
    setPhase("creating");
    let made: IngestBatchCreated;
    try {
      made = await createBatch(body, { idempotencyKey });
    } catch (failure) {
      setPhase("planning");
      showFailure(failure, "The batch couldn't be made");
      return;
    }
    setBatch(made);
    await uploadAndSubmit(made, designUploads(plan.designs, made.items));
  }

  /** Uploads again every design not yet confirmed: those that failed, and those a pause left. */
  function retryUploads() {
    if (!batch) return;
    const left = designUploads(plan.designs, batch.items).filter(
      (design) => uploads.states.get(design.itemId)?.status !== "confirmed",
    );
    void uploadAndSubmit(batch, left);
  }

  return {
    name,
    setName,
    batchName,
    phase,
    batch,
    problems,
    localProblems,
    /** The API refused this very request: its problems are the ones on show. */
    refusedBody,
    refusal,
    error,
    uploads,
    start: () => void start(),
    retryUploads,
    submit: () => (batch ? void submit(batch.id) : undefined),
  };
}

export type BulkUploadFlow = ReturnType<typeof useBulkUploadFlow>;
