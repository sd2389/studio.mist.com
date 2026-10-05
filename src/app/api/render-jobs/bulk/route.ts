import { NextResponse } from "next/server";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";
import { requireFeatureApi } from "@/lib/feature-flags/server-fetch";

/** `{ jobs: [...] }`: every job or none. The API takes no Idempotency-Key here. */
export async function POST(request: Request) {
  const unavailable = await requireFeatureApi("server_exports");
  if (unavailable) return unavailable;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await upstreamFetch("/render-jobs/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return relayUpstreamJson(upstream, "Failed to start the exports");
}
