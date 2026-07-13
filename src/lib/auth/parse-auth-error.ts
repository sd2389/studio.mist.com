function messageFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && "msg" in item) {
          const msg = (item as { msg?: unknown }).msg;
          return typeof msg === "string" ? msg.trim() : "";
        }
        return "";
      })
      .filter(Boolean);
    return parts.length ? parts.join("; ") : null;
  }
  return null;
}

export function parseAuthErrorBody(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const body = json as Record<string, unknown>;
  return (
    messageFromUnknown(body.detail) ??
    messageFromUnknown(body.error) ??
    messageFromUnknown(body.message) ??
    fallback
  );
}
