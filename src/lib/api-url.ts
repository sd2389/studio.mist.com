/** Server-only preferred (secrets); falls back to public URL. */
export function getServerApiUrl(): string {
  const url = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!url) return "";
  return url.replace(/\/$/, "");
}

/** Browser-safe API base for CORS requests to FastAPI when needed. */
export function getPublicApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL;
  if (!url) return "";
  return url.replace(/\/$/, "");
}
