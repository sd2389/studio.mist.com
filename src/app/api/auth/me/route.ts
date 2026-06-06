import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { authHeaders } from "@/lib/auth/server-session";

export async function GET() {
  const headers = await authHeaders();
  const upstream = await upstreamFetch("/auth/me", { headers });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Not authenticated") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
