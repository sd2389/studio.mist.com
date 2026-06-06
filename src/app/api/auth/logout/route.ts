import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { authHeaders } from "@/lib/auth/server-session";
import { readUpstreamJson, upstreamFetch } from "@/lib/auth/upstream";

export async function POST() {
  const headers = await authHeaders();
  const upstream = await upstreamFetch("/auth/logout", { method: "POST", headers });
  await readUpstreamJson(upstream);

  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true, message: "Logged out" });
}
