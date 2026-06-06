import { useBatchExportStore } from "@/stores/batch-export-store";

/** Wait for React Three Fiber + material application to settle before capture. */
export function waitForRenderFrames(count = 3): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count;
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function waitForModelReady(timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (useBatchExportStore.getState().modelReady) {
        resolve();
        return;
      }
      if (performance.now() - started > timeoutMs) {
        reject(new Error("Model load timed out"));
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}
