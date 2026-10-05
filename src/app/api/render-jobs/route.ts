import { NextResponse } from "next/server";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";
import { requireFeatureApi } from "@/lib/feature-flags/server-fetch";

/** The filters `GET /render-jobs` takes; the API validates their values. */
const LIST_PARAMS = ["scene_id", "batch_id", "kind", "status", "before", "limit"] as const;

export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const forwarded = new URLSearchParams();
  for (const name of LIST_PARAMS) {
    const value = incoming.get(name);
    if (value !== null) forwarded.set(name, value);
  }
  const query = forwarded.toString();
  const upstream = await upstreamFetch(query ? `/render-jobs?${query}` : "/render-jobs");
  return relayUpstreamJson(upstream, "Failed to list exports");
}

/** 201 with a new job, or 200 with the job an earlier request with the same Idempotency-Key made. */
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
  const upstream = await upstreamFetch("/render-jobs", {
    method: "POST",
    body: JSON.stringify(body),
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });
  return relayUpstreamJson(upstream, "Failed to start the export");
}
