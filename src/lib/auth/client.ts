import type { AuthResponse, MessageResponse } from "@/lib/auth/types";

async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const data = (await res.json()) as T & { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? "Request failed");
  }
  return data;
}

export function signUp(body: {
  email: string;
  password: string;
  name?: string;
}): Promise<AuthResponse> {
  return authRequest<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function logIn(body: { email: string; password: string }): Promise<AuthResponse> {
  return authRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function logOut(): Promise<MessageResponse> {
  return authRequest<MessageResponse>("/api/auth/logout", { method: "POST" });
}

export function forgotPassword(email: string): Promise<MessageResponse> {
  return authRequest<MessageResponse>("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(body: { token: string; password: string }): Promise<MessageResponse> {
  return authRequest<MessageResponse>("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function submitContact(body: {
  name: string;
  email: string;
  message: string;
}): Promise<MessageResponse> {
  return authRequest<MessageResponse>("/api/auth/contact", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchMe(): Promise<AuthResponse["user"]> {
  return authRequest<AuthResponse["user"]>("/api/auth/me", { method: "GET" });
}
