import { NextResponse } from "next/server";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";

/**
 * What a bulk body would cost: each job's quote, or the status and reason creating it would
 * answer, and the total of the ones that can be made. Nothing is held or queued.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await upstreamFetch("/render-jobs/bulk/quote", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return relayUpstreamJson(upstream, "Failed to price the exports");
}
