import { NextResponse } from "next/server";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";
import { requireFeatureApi } from "@/lib/feature-flags/server-fetch";

/**
 * `{ jobs: [...] }`: every job or none. 201 with the new jobs, or 200 with the jobs an earlier
 * request with the same Idempotency-Key made, which is passed on as a single create's is.
 */
export async function POST(request: Request) {
  const unavailable = await requireFeatureApi("server_exports");
  if (unavailable) return unavailable;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  const upstream = await upstreamFetch("/render-jobs/bulk", {
    method: "POST",
    body: JSON.stringify(body),
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });
  return relayUpstreamJson(upstream, "Failed to start the exports");
}
