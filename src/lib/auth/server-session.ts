import "server-only";

import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { getServerApiUrl } from "@/lib/api-url";
import type { AuthUser } from "@/lib/auth/types";

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function authHeaders(): Promise<HeadersInit> {
  const token = await getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const api = getServerApiUrl();
  if (!api) return null;

  const res = await fetch(`${api}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as AuthUser;
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
