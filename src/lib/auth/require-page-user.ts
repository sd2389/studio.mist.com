import "server-only";

import { redirect } from "next/navigation";
import { safeAuthNext } from "@/lib/auth/safe-auth-next";
import { fetchCurrentUser, getSessionToken } from "@/lib/auth/server-session";
import type { AuthUser } from "@/lib/auth/types";

export async function requirePageUser(nextPath: string): Promise<AuthUser> {
  const user = await fetchCurrentUser();
  if (user) return user;

  const fallback = nextPath.startsWith("/") ? nextPath : "/dashboard";
  const safeNext = safeAuthNext(nextPath, fallback);
  const token = await getSessionToken();
  if (token) {
    redirect(`/api/auth/clear-session?next=${encodeURIComponent(safeNext)}`);
  }
  redirect(`/login?next=${encodeURIComponent(safeNext)}`);
}
