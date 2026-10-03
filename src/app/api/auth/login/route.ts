import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { sessionCookieOptions } from "@/lib/auth/server-session";
import { clientIpHeaders } from "@/lib/auth/client-ip";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";
import { enforceIpRateLimit } from "@/lib/observability/api-rate-limit";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

async function setSessionFromAuthResponse(json: unknown): Promise<NextResponse> {
  const body = json as { token?: string; user?: unknown };
  if (!body.token || !body.user) {
    return NextResponse.json({ error: "Invalid auth response" }, { status: 502 });
  }
  const res = NextResponse.json({ user: body.user });
  const store = await cookies();
  store.set(SESSION_COOKIE, body.token, sessionCookieOptions(SESSION_MAX_AGE));
  return res;
}

export async function POST(request: Request) {
  const limited = enforceIpRateLimit({ scope: "api.auth.login", maxRequests: 30, request });
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await upstreamFetch("/auth/login", {
    method: "POST",
    headers: clientIpHeaders(request),
    body: JSON.stringify(payload),
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Login failed") },
      { status: upstream.status },
    );
  }
  return setSessionFromAuthResponse(json);
}
