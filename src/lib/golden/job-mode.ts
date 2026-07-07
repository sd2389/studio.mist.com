export type JobPayload = {
  model_url: string;
  lighting: string;
  preset: string;
  width: number;
  height: number;
};

export function jobEndpoints(apiBase: string, jobId: string, token: string) {
  const base = apiBase.replace(/\/$/, "");
  const q = `?token=${encodeURIComponent(token)}`;
  return {
    payload: `${base}/render-jobs/${jobId}/payload${q}`,
    complete: `${base}/render-jobs/${jobId}/complete${q}`,
    fail: `${base}/render-jobs/${jobId}/fail${q}`,
  };
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
