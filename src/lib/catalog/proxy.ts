/**
 * Server-only proxy to the FastAPI catalog. Keeps the backend base URL and any
 * future auth header in one place, and isolates upstream failures (returns 502
 * instead of throwing) so a catalog outage never crashes the page.
 */

import { NextResponse } from "next/server";
import { getServerApiUrl } from "@/lib/api-url";
import { authHeaders } from "@/lib/auth/server-session";

export async function proxyCatalog(
  backendPath: string,
  searchParams: URLSearchParams,
): Promise<NextResponse> {
  const base = getServerApiUrl();
  if (!base) {
    return NextResponse.json({ error: "API_URL is not configured" }, { status: 500 });
  }

  const qs = searchParams.toString();
  const url = `${base}${backendPath}${qs ? `?${qs}` : ""}`;
  const auth = await authHeaders();

  try {
    const res = await fetch(url, { cache: "no-store", headers: auth });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog upstream error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
