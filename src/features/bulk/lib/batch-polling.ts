import { getBatch, listBatchItems, type BatchItemsQuery, type BatchView } from "@/lib/api/ingest";
import { pollUntil } from "@/lib/polling";
import { isBatchFollowed } from "../domain/statuses";

export function loadBatchView(batchId: number, query: BatchItemsQuery, signal?: AbortSignal): Promise<BatchView> {
  return Promise.all([getBatch(batchId, { signal }), listBatchItems(batchId, query, { signal })]).then(
    ([batch, items]) => ({ batch, items }),
  );
}

type PollBatchOptions = {
  signal: AbortSignal;
  onView: (view: BatchView) => void;
  onError?: (error: Error) => void;
};

/**
 * Follows a batch while it is processing or its archive builds, with the page of designs on show:
 * after 1 s, then less often, up to every 5 s, as a render job is followed (`pollUntil`). Resolves
 * once neither moves on; rejects when `signal` aborts or the API refuses the batch.
 */
export function pollBatch(batchId: number, query: BatchItemsQuery, { signal, onView, onError }: PollBatchOptions): Promise<BatchView> {
  return pollUntil((polling) => loadBatchView(batchId, query, polling), (view) => !isBatchFollowed(view.batch), {
    signal,
    onValue: onView,
    onError,
  });
}
