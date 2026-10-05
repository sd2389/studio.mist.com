import "server-only";

import { NextResponse } from "next/server";
import { clientIp } from "@/lib/auth/client-ip";
import { getSessionToken } from "@/lib/auth/server-session";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

type ApiRateLimitOptions = {
  scope: string;
  maxRequests: number;
  windowMs?: number;
  request: Request;
};

function limitByIdentity(options: ApiRateLimitOptions, identity: string): NextResponse | null {
  const result = checkRateLimit({
    key: rateLimitKey(options.scope, identity),
    maxRequests: options.maxRequests,
    windowMs: options.windowMs ?? 60 * 60 * 1000,
  });

  if (result.ok) return null;

  return NextResponse.json(
    { error: "Rate limit exceeded. Try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    },
  );
}

/** Counts by session when there is one, else by IP. Signed-in API routes need none: the API limits them. */
export async function enforceApiRateLimit(
  options: ApiRateLimitOptions,
): Promise<NextResponse | null> {
  const token = await getSessionToken();
  const identity = token ? `user:${token.slice(0, 16)}` : `ip:${clientIp(options.request) ?? "unknown"}`;
  return limitByIdentity(options, identity);
}

/**
 * Counts by the caller's IP, whatever cookie it sends: for sign-in and sign-up, which the API
 * can't limit per caller since every request it gets through this proxy comes from one address.
 */
export function enforceIpRateLimit(options: ApiRateLimitOptions): NextResponse | null {
  return limitByIdentity(options, `ip:${clientIp(options.request) ?? "unknown"}`);
}
