function messageFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  // A detail the API gave as an object says what went wrong in its `message`.
  if (value && typeof value === "object" && !Array.isArray(value) && "message" in value) {
    return messageFromUnknown((value as { message?: unknown }).message);
  }
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

/**
 * The problems an answer lists, one per item or row, as a batch's 422 gives them
 * (`detail: { message, problems }`, or `problems` beside a proxy's `error`); null for none.
 */
export function problemsFromErrorBody(json: unknown): unknown[] | null {
  if (!json || typeof json !== "object") return null;
  const body = json as { problems?: unknown; detail?: unknown };
  if (Array.isArray(body.problems)) return body.problems;
  const detail = body.detail as { problems?: unknown } | null | undefined;
  return detail && typeof detail === "object" && Array.isArray(detail.problems) ? detail.problems : null;
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
