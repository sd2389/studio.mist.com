import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { sessionCookieOptions } from "@/lib/auth/server-session";
import { readUpstreamJson, upstreamError, upstreamFetch } from "@/lib/auth/upstream";

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
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await upstreamFetch("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const json = await readUpstreamJson(upstream);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstreamError(json, "Sign up failed") },
      { status: upstream.status },
    );
  }
  return setSessionFromAuthResponse(json);
}
