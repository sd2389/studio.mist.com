import { NextResponse } from "next/server";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";

/** What a create body would cost; nothing is held or queued. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await upstreamFetch("/render-jobs/quote", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return relayUpstreamJson(upstream, "Failed to price the export");
}
