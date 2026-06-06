import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { requireAdminApi } from "@/lib/auth/require-api-access";
import { authHeaders, sessionCookieOptions } from "@/lib/auth/server-session";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  const headers = await authHeaders();
  const upstream = await upstreamFetch(`/admin/users/${id}/impersonate`, {
    method: "POST",
    headers,
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Impersonation failed") },
      { status: upstream.status },
    );
  }
  const body = json as { token?: string; email?: string };
  if (!body.token) {
    return NextResponse.json({ error: "Invalid impersonation response" }, { status: 502 });
  }
  const res = NextResponse.json({ ok: true, email: body.email });
  const store = await cookies();
  store.set(SESSION_COOKIE, body.token, sessionCookieOptions(SESSION_MAX_AGE));
  return res;
}
