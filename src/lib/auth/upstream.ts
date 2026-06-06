import "server-only";

import { getServerApiUrl } from "@/lib/api-url";
import { authHeaders } from "@/lib/auth/server-session";

export async function upstreamFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const api = getServerApiUrl();
  if (!api) {
    return new Response(JSON.stringify({ error: "Set API_URL or NEXT_PUBLIC_API_URL" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const auth = await authHeaders();
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(auth)) {
    if (typeof value === "string") headers.set(key, value);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    return await fetch(`${api}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      headers,
      cache: init.cache ?? "no-store",
    });
  } catch {
    return new Response(JSON.stringify({ error: "Backend unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function readUpstreamJson(upstream: Response): Promise<unknown> {
  const text = await upstream.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

export function upstreamError(json: unknown, fallback: string): string {
  const body = json as { detail?: string; error?: string; message?: string };
  return body.detail ?? body.error ?? body.message ?? fallback;
}
