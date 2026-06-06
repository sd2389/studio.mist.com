import "server-only";

import { NextResponse } from "next/server";
import { fetchCurrentUser } from "@/lib/auth/server-session";

export async function requireSessionApi(): Promise<NextResponse | null> {
  const user = await fetchCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  return null;
}

export async function requireAdminApi(): Promise<NextResponse | null> {
  const user = await fetchCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}
