import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { authHeaders } from "@/lib/auth/server-session";

export async function POST() {
  const headers = await authHeaders();
  const upstream = await upstreamFetch("/billing/portal", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Portal session failed") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
