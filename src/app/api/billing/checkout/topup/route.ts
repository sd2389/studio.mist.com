import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { authHeaders } from "@/lib/auth/server-session";

export async function POST(request: Request) {
  const headers = await authHeaders();
  const body = await request.json();
  const upstream = await upstreamFetch("/billing/checkout/topup", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Top-up checkout failed") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
