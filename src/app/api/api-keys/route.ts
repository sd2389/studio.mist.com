import { NextResponse } from "next/server";
import { relayUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";

/*
 * The profile page's API keys (backend/app/routers/api_keys.py), as the signed-in user: the
 * session cookie (httpOnly, SameSite=Lax) becomes the Authorization header here, as for every
 * signed-in route, so another site can't make or revoke a key with it.
 */

export async function GET() {
  const upstream = await upstreamFetch("/api-keys");
  return relayUpstreamJson(upstream, "Failed to list API keys");
}

/** 201 with the new key and its secret, shown this once: nothing may cache the answer. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await upstreamFetch("/api-keys", { method: "POST", body: JSON.stringify(body) });
  const answer = await relayUpstreamJson(upstream, "Failed to create the API key");
  answer.headers.set("Cache-Control", "no-store");
  return answer;
}
