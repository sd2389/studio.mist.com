import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { authHeaders } from "@/lib/auth/server-session";

export async function PATCH(request: Request) {
  const headers = await authHeaders();
  const body = await request.json();
  const upstream = await upstreamFetch("/auth/profile", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Profile update failed") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
