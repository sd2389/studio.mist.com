import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { safeAuthNext } from "@/lib/auth/safe-auth-next";
import { sessionCookieOptions } from "@/lib/auth/server-session";

export async function GET(request: NextRequest) {
  const next = safeAuthNext(request.nextUrl.searchParams.get("next"));
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  store.delete(SESSION_COOKIE);

  const login = new URL("/login", request.url);
  login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}
