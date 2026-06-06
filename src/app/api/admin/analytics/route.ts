import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/require-api-access";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { authHeaders } from "@/lib/auth/server-session";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const headers = await authHeaders();
  const upstream = await upstreamFetch("/admin/analytics", { headers });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Failed to load analytics") },
      { status: upstream.status },
    );
  }
  return NextResponse.json(json);
}
