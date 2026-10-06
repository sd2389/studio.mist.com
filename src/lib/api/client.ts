import { AuthRequestError } from "@/lib/auth/is-auth-required-error";

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

/** Fails with the answer's `detail` or `error` and its HTTP status (`AuthRequestError`). */
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
    throw new AuthRequestError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status);
  }

  return data as T;
}

/** `init` adds headers or an abort signal. */
export function apiGet<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, { ...init, method: "GET" });
}

export function apiPost<T>(path: string, body: unknown, init: RequestInit = {}): Promise<T> {
  return request<T>(path, { ...init, method: "POST", body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

/** A file, such as an image, as the body itself, under its own content type. */
export function apiPutFile<T>(path: string, file: Blob): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}
