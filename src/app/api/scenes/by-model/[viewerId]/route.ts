import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";
import { requireSessionApi } from "@/lib/auth/require-api-access";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { enforceApiRateLimit } from "@/lib/observability/api-rate-limit";

type Ctx = { params: Promise<{ viewerId: string }> };

async function resolveViewerId(ctx: Ctx): Promise<string | null> {
  const { viewerId } = await ctx.params;
  const trimmed = viewerId.trim();
  return trimmed ? trimmed : null;
}

export async function GET(request: Request, ctx: Ctx) {
  const limited = await enforceApiRateLimit({
    scope: "api.scenes.by-model",
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
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to load scene") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const denied = await requireSessionApi();
  if (denied) return denied;

  const viewerId = await resolveViewerId(ctx);
  if (!viewerId) return NextResponse.json({ error: "Invalid viewerId" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await upstreamFetch(`/scenes/by-model/${encodeURIComponent(viewerId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to update scene") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
