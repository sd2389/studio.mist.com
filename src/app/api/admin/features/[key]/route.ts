import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-api-access";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { authHeaders } from "@/lib/auth/server-session";

type RouteContext = {
  params: Promise<{ key: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { key } = await context.params;
  const body = await request.json();
  const headers = await authHeaders();
  const upstream = await upstreamFetch(`/admin/features/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to update feature") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
