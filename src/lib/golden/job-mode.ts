export type JobPayload = {
  model_url: string;
  lighting: string;
  preset: string;
  width: number;
  height: number;
};

export function jobEndpoints(apiBase: string, jobId: string) {
  const base = apiBase.replace(/\/$/, "");
  return {
    payload: `${base}/render-jobs/${jobId}/payload`,
    complete: `${base}/render-jobs/${jobId}/complete`,
    fail: `${base}/render-jobs/${jobId}/fail`,
  };
}

/** Headers for a job endpoint. The per-job token travels here, never in the URL, which access logs keep. */
export function jobHeaders(token: string, headers: Record<string, string> = {}): Record<string, string> {
  return { ...headers, "X-Job-Token": token };
}

export function isValidPayload(p: unknown): p is JobPayload {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.model_url === "string" &&
    typeof o.lighting === "string" &&
    typeof o.preset === "string" &&
    typeof o.width === "number" &&
    typeof o.height === "number"
  );
}
