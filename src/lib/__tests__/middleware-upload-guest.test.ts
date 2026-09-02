import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { middleware } from "@/middleware";

function request(pathname: string, session?: string): NextRequest {
  const headers = new Headers();
  if (session) headers.set("cookie", `${SESSION_COOKIE}=${session}`);
  return new NextRequest(new URL(pathname, "http://localhost:3000"), { headers });
}

function redirectLocation(res: Response): string | null {
  const loc = res.headers.get("location");
  return loc;
}

describe("middleware guest upload boundary", () => {
  it("does not redirect unauthenticated /upload-model to /login", () => {
    const res = middleware(request("/upload-model"));
    expect(redirectLocation(res)).toBeNull();
    expect(res.status).toBe(200);
  });

  it("does not redirect unauthenticated /upload-model/ nested path to /login", () => {
    // matcher no longer includes upload-model; path logic also leaves it public
    const res = middleware(request("/upload-model/extra"));
    expect(redirectLocation(res)).toBeNull();
  });

  it("still protects /dashboard without a session", () => {
    const res = middleware(request("/dashboard"));
    const loc = redirectLocation(res);
    expect(loc).toBeTruthy();
    expect(new URL(loc!).pathname).toBe("/login");
    expect(new URL(loc!).searchParams.get("next")).toBe("/dashboard");
  });

  it("still protects /model/* without a session", () => {
    const res = middleware(request("/model/42"));
    const loc = redirectLocation(res);
    expect(loc).toBeTruthy();
    expect(new URL(loc!).pathname).toBe("/login");
    expect(new URL(loc!).searchParams.get("next")).toBe("/model/42");
  });

  it("still protects /profile without a session", () => {
    const res = middleware(request("/profile"));
    const loc = redirectLocation(res);
    expect(loc).toBeTruthy();
    expect(new URL(loc!).pathname).toBe("/login");
  });

  it("still protects /admin without a session", () => {
    const res = middleware(request("/admin"));
    const loc = redirectLocation(res);
    expect(loc).toBeTruthy();
    expect(new URL(loc!).pathname).toBe("/login");
  });

  it("allows protected routes when studio_session cookie is present", () => {
    const res = middleware(request("/dashboard", "token-value"));
    expect(redirectLocation(res)).toBeNull();
  });
});
