import "server-only";

import { NextResponse } from "next/server";
import { getSessionToken } from "@/lib/auth/server-session";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

type ApiRateLimitOptions = {
  scope: string;
  maxRequests: number;
  windowMs?: number;
  request: Request;
};

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function enforceApiRateLimit(
  options: ApiRateLimitOptions,
): Promise<NextResponse | null> {
  const token = await getSessionToken();
  const identity = token ? `user:${token.slice(0, 16)}` : `ip:${clientIp(options.request)}`;
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
