import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-api-access";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { authHeaders } from "@/lib/auth/server-session";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  const body = await request.text();
  const headers = await authHeaders();
  const upstream = await upstreamFetch(`/admin/users/${id}/reset-allotments`, {
    method: "POST",
    headers,
    body,
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Reset allotments failed") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
