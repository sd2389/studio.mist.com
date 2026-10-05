import "server-only";

/** The headers the API reads a proxied caller's IP from; it believes them only with the token. */
export const PROXY_TOKEN_HEADER = "X-Internal-Proxy-Token";
export const CLIENT_IP_HEADER = "X-Client-IP";

/** The caller's IP as the platform in front of this app reports it; null when it reports none. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

/**
 * Headers that tell the API which caller a proxied request is for: their IP, vouched for by
 * INTERNAL_PROXY_TOKEN, a secret this server shares with the API. Every request this proxy makes
 * comes from its own address, so without them the API counts all callers' sign-ins as one.
 */
export function clientIpHeaders(request: Request): Record<string, string> {
  const token = process.env.INTERNAL_PROXY_TOKEN;
  const ip = clientIp(request);
  if (!token || !ip) return {};
  return { [PROXY_TOKEN_HEADER]: token, [CLIENT_IP_HEADER]: ip };
}
