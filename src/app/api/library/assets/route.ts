import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const upstream = await upstreamFetch(`/library/assets${qs ? `?${qs}` : ""}`);
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to load assets") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
