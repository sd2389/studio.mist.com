import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";

export async function GET() {
  const upstream = await upstreamFetch("/scenes");
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to list scenes") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
