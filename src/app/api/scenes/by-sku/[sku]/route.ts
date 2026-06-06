import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";
import { readUpstreamJson, upstreamError } from "@/lib/auth/upstream";

type Ctx = { params: Promise<{ sku: string }> };

async function resolveSku(ctx: Ctx): Promise<string | null> {
  const { sku } = await ctx.params;
  const trimmed = sku.trim();
  return trimmed ? trimmed : null;
}

export async function GET(_request: Request, ctx: Ctx) {
  const sku = await resolveSku(ctx);
  if (!sku) return NextResponse.json({ error: "Invalid SKU" }, { status: 400 });

  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json({ error: "Set API_URL or NEXT_PUBLIC_API_URL" }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${api}/scenes/by-sku/${encodeURIComponent(sku)}`, {
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to load scene") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
