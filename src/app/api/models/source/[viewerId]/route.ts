import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";
import { enforceApiRateLimit } from "@/lib/observability/api-rate-limit";

type Ctx = { params: Promise<{ viewerId: string }> };

async function resolveViewerId(ctx: Ctx): Promise<string | null> {
  const { viewerId } = await ctx.params;
  const trimmed = viewerId.trim();
  return trimmed ? trimmed : null;
}

export async function GET(request: Request, ctx: Ctx) {
  const limited = await enforceApiRateLimit({
    scope: "api.models.source",
    maxRequests: 120,
    request,
  });
  if (limited) return limited;

  const viewerId = await resolveViewerId(ctx);
  if (!viewerId) return NextResponse.json({ error: "Invalid viewerId" }, { status: 400 });

  const api = getServerApiUrl();
  if (!api) {
    return NextResponse.json({ error: "Set API_URL or NEXT_PUBLIC_API_URL" }, { status: 503 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${api}/scenes/by-model/${encodeURIComponent(viewerId)}`, {
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
  const text = await upstream.text();
  const json = (() => {
    if (!text) return {} as Record<string, unknown>;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { detail: text } as Record<string, unknown>;
    }
  })() as {
    detail?: string;
    model_key?: string;
    model_url?: string | null;
  };
  if (!upstream.ok) {
    return NextResponse.json({ error: json.detail ?? "Failed to load scene" }, { status: upstream.status });
  }
  if (!json.model_url || !json.model_key) {
    return NextResponse.json({ error: "Source model not available" }, { status: 404 });
  }

  return NextResponse.json({
    model_key: json.model_key,
    url: json.model_url,
  });
}
