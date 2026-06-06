import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const upstream = await upstreamFetch(`/library/materials${qs ? `?${qs}` : ""}`);
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to load materials") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await upstreamFetch("/library/materials", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to create material") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
