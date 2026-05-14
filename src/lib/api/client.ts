function getApiBase(): string {
  const url = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "";
  return url.replace(/\/$/, "");
}

function resolveUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (normalized.startsWith("/api/")) return normalized;
  const base = getApiBase();
  return base ? `${base}${normalized}` : normalized;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(resolveUrl(path), {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const detail =
      (data as { detail?: string; error?: string })?.detail ??
      (data as { detail?: string; error?: string })?.error ??
      res.statusText ??
      "Request failed";
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  return data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}
