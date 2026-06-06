import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-api-access";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { authHeaders } from "@/lib/auth/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  const headers = await authHeaders();
  const upstream = await upstreamFetch(`/admin/users/${id}`, { headers });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to load user") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
