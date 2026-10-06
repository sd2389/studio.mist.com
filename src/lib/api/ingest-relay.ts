import "server-only";

import { NextResponse } from "next/server";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";
import { requireFeatureApi } from "@/lib/feature-flags/server-fetch";

type IngestRelayOptions = {
  /** Starts or adds to a batch: 404 while the `bulk_pipeline` flag is off, as the API answers. */
  addsWork?: boolean;
  /** Pass the request's JSON body on (400 when it isn't JSON). */
  body?: boolean;
  /** Query parameters passed on as they are; the API validates their values. */
  query?: readonly string[];
  /** The error when the API answers without one. */
  fallback: string;
};

export function invalidIdAnswer(): NextResponse {
  return NextResponse.json({ error: "Invalid id" }, { status: 400 });
}

function forwardedQuery(request: Request, names: readonly string[]): string {
  const incoming = new URL(request.url).searchParams;
  const forwarded = new URLSearchParams();
  for (const name of names) {
    const value = incoming.get(name);
    if (value !== null) forwarded.set(name, value);
  }
  const query = forwarded.toString();
  return query ? `?${query}` : "";
}

/**
 * Passes a request on to the ingest API (backend/app/routers/ingest.py) as the signed-in user,
 * with its Idempotency-Key, and relays the answer (`relayUpstreamJson`: a batch's 422 keeps its
 * `problems`). Only JSON goes through here: CAD files go straight to storage on signed URLs.
 */
export async function relayIngest(
  request: Request,
  path: string,
  { addsWork = false, body = false, query = [], fallback }: IngestRelayOptions,
): Promise<NextResponse> {
  if (addsWork) {
    const unavailable = await requireFeatureApi("bulk_pipeline");
    if (unavailable) return unavailable;
  }

  const init: RequestInit = { method: request.method };
  if (body) {
    try {
      init.body = JSON.stringify(await request.json());
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }
  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) init.headers = { "Idempotency-Key": idempotencyKey };

  const upstream = await upstreamFetch(`${path}${forwardedQuery(request, query)}`, init);
  return relayUpstreamJson(upstream, fallback);
}
