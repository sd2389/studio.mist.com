# Auth Login / Signup Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify sign-in/sign-up on `/login?mode=signup`, fix `next` redirects and stale sessions, and harden auth error UX.

**Architecture:** Keep the BFF httpOnly `studio_session` cookie. Add pure helpers (`safeAuthNext`, `parseAuthErrorBody`) under `src/lib/auth/`. Replace `LoginForm`/`SignUpForm` with one `AuthPanel`. `/signup` server-redirects to `/login?mode=signup`. Stale sessions clear via a small GET clear-session route before bouncing to login (avoids middleware login↔dashboard loops).

**Tech Stack:** Next.js App Router, existing auth BFF routes, Vitest, current `AuthShell` UI

**Spec:** [`docs/superpowers/specs/2026-07-13-auth-login-signup-flow-design.md`](../specs/2026-07-13-auth-login-signup-flow-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/auth/safe-auth-next.ts` | Validate `next` redirect targets |
| `src/lib/auth/parse-auth-error.ts` | Normalize FastAPI/BFF error bodies to strings |
| `src/lib/auth/require-page-user.ts` | RSC guard: user or clear+redirect to login |
| `src/app/api/auth/clear-session/route.ts` | Delete stale cookie then redirect to `/login?next=` |
| `src/features/auth/ui/AuthPanel.tsx` | Unified sign-in / sign-up UI |
| `src/app/login/page.tsx` | Renders `AuthPanel` in Suspense |
| `src/app/signup/page.tsx` | Server redirect to `/login?mode=signup` |
| `src/lib/auth/client.ts` | Use shared error parser |
| `src/lib/auth/upstream.ts` | `upstreamError` delegates to parser |
| `src/middleware.ts` | Honor validated `next` when bouncing logged-in users off auth pages |
| `src/features/auth/ui/ResetPasswordForm.tsx` | Token loading state (no invalid-link flash) |
| Protected pages (`dashboard`, etc.) | Use `requirePageUser` |
| Landing / pricing / upload dialog links | Prefer `/login?mode=signup` |
| Delete | `LoginForm.tsx`, `SignUpForm.tsx` after `AuthPanel` ships |

---

### Task 1: `safeAuthNext` helper + tests

**Files:**
- Create: `src/lib/auth/safe-auth-next.ts`
- Create: `src/lib/__tests__/safe-auth-next.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { safeAuthNext } from "@/lib/auth/safe-auth-next";

describe("safeAuthNext", () => {
  it("returns relative app paths", () => {
    expect(safeAuthNext("/pricing")).toBe("/pricing");
    expect(safeAuthNext("/dashboard")).toBe("/dashboard");
    expect(safeAuthNext("/model/abc?x=1")).toBe("/model/abc?x=1");
  });

  it("rejects open redirects and falls back", () => {
    expect(safeAuthNext("//evil.com")).toBe("/dashboard");
    expect(safeAuthNext("https://evil.com")).toBe("/dashboard");
    expect(safeAuthNext("http://evil.com")).toBe("/dashboard");
    expect(safeAuthNext("/\\evil.com")).toBe("/dashboard");
    expect(safeAuthNext("pricing")).toBe("/dashboard");
    expect(safeAuthNext("")).toBe("/dashboard");
    expect(safeAuthNext(null)).toBe("/dashboard");
  });

  it("uses custom fallback", () => {
    expect(safeAuthNext(null, "/profile")).toBe("/profile");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/safe-auth-next.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

```ts
// src/lib/auth/safe-auth-next.ts
const DEFAULT_FALLBACK = "/dashboard";

export function safeAuthNext(
  raw: string | null | undefined,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (!raw || typeof raw !== "string") return fallback;
  const next = raw.trim();
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("://")) return fallback;
  if (next.includes("\\")) return fallback;
  return next;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/lib/__tests__/safe-auth-next.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/safe-auth-next.ts src/lib/__tests__/safe-auth-next.test.ts
git commit -m "$(cat <<'EOF'
Add safeAuthNext for post-auth redirects.

EOF
)"
```

---

### Task 2: Auth error body parser + wire into upstream/client

**Files:**
- Create: `src/lib/auth/parse-auth-error.ts`
- Create: `src/lib/__tests__/parse-auth-error.test.ts`
- Modify: `src/lib/auth/upstream.ts` (`upstreamError`)
- Modify: `src/lib/auth/client.ts` (`authRequest`)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { parseAuthErrorBody } from "@/lib/auth/parse-auth-error";

describe("parseAuthErrorBody", () => {
  it("reads string detail/error/message", () => {
    expect(parseAuthErrorBody({ detail: "Nope" }, "fallback")).toBe("Nope");
    expect(parseAuthErrorBody({ error: "Bad" }, "fallback")).toBe("Bad");
  });

  it("joins FastAPI validation arrays", () => {
    expect(
      parseAuthErrorBody(
        {
          detail: [
            { loc: ["body", "email"], msg: "field required", type: "missing" },
            { msg: "ensure this value has at least 8 characters" },
          ],
        },
        "fallback",
      ),
    ).toBe("field required; ensure this value has at least 8 characters");
  });

  it("falls back for empty bodies", () => {
    expect(parseAuthErrorBody({}, "Request failed")).toBe("Request failed");
    expect(parseAuthErrorBody(null, "Request failed")).toBe("Request failed");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/__tests__/parse-auth-error.test.ts`

- [ ] **Step 3: Implement parser**

```ts
// src/lib/auth/parse-auth-error.ts
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
```

- [ ] **Step 4: Wire `upstreamError`**

In `src/lib/auth/upstream.ts`, replace the body of `upstreamError` with:

```ts
import { parseAuthErrorBody } from "@/lib/auth/parse-auth-error";

export function upstreamError(json: unknown, fallback: string): string {
  return parseAuthErrorBody(json, fallback);
}
```

- [ ] **Step 5: Wire client `authRequest`**

In `src/lib/auth/client.ts`:

```ts
import { parseAuthErrorBody } from "@/lib/auth/parse-auth-error";

async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(parseAuthErrorBody(data, "Request failed"));
  }
  return data as T;
}
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `npx vitest run src/lib/__tests__/parse-auth-error.test.ts src/lib/__tests__/safe-auth-next.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/parse-auth-error.ts src/lib/__tests__/parse-auth-error.test.ts src/lib/auth/upstream.ts src/lib/auth/client.ts
git commit -m "$(cat <<'EOF'
Parse FastAPI auth errors into readable messages.

EOF
)"
```

---

### Task 3: Clear-session route + `requirePageUser`

**Files:**
- Create: `src/app/api/auth/clear-session/route.ts`
- Create: `src/lib/auth/require-page-user.ts`
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/app/profile/page.tsx`
- Modify: admin pages that already `redirect("/login?next=...")` when `!user` (same pattern)

- [ ] **Step 1: Clear-session GET handler**

```ts
// src/app/api/auth/clear-session/route.ts
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { safeAuthNext } from "@/lib/auth/safe-auth-next";
import { sessionCookieOptions } from "@/lib/auth/server-session";

export async function GET(request: NextRequest) {
  const next = safeAuthNext(request.nextUrl.searchParams.get("next"));
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  store.delete(SESSION_COOKIE);

  const login = new URL("/login", request.url);
  login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}
```

- [ ] **Step 2: `requirePageUser`**

```ts
// src/lib/auth/require-page-user.ts
import "server-only";

import { redirect } from "next/navigation";
import { safeAuthNext } from "@/lib/auth/safe-auth-next";
import { fetchCurrentUser, getSessionToken } from "@/lib/auth/server-session";
import type { AuthUser } from "@/lib/auth/types";

export async function requirePageUser(nextPath: string): Promise<AuthUser> {
  const user = await fetchCurrentUser();
  if (user) return user;

  const safeNext = safeAuthNext(nextPath, nextPath.startsWith("/") ? nextPath : "/dashboard");
  const token = await getSessionToken();
  if (token) {
    redirect(`/api/auth/clear-session?next=${encodeURIComponent(safeNext)}`);
  }
  redirect(`/login?next=${encodeURIComponent(safeNext)}`);
}
```

- [ ] **Step 3: Wire dashboard**

Replace soft `fetchCurrentUser()` with:

```ts
import { requirePageUser } from "@/lib/auth/require-page-user";

// inside page:
const user = await requirePageUser("/dashboard");
// then Promise.all for loadDashboardData + billing can still run in parallel IF you call requirePageUser first;
// preferred: await requirePageUser first, then parallel data loads.
```

Preferred shape:

```ts
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requirePageUser("/dashboard");
  const params = await searchParams;
  const filters = parseDashboardSearchParams(params);
  const [{ initialScenes, initialError, filterResult, allSceneCount }, billing] =
    await Promise.all([loadDashboardData(filters), fetchBillingAccountServer()]);

  return (
    <DashboardShell
      ...
      userEmail={user.email}
      isAdmin={user.role === "admin"}
    />
  );
}
```

- [ ] **Step 4: Wire profile + admin pages**

Replace:

```ts
const user = await fetchCurrentUser();
if (!user) redirect("/login?next=/profile");
```

with:

```ts
const user = await requirePageUser("/profile");
```

Do the same for each admin page with its own `next` path (`/admin`, `/admin/users`, etc.).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/clear-session/route.ts src/lib/auth/require-page-user.ts src/app/dashboard/page.tsx src/app/profile/page.tsx src/app/admin/**/*.tsx
git commit -m "$(cat <<'EOF'
Require valid session on protected pages and clear stale cookies.

EOF
)"
```

---

### Task 4: Middleware honors validated `next`

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Update middleware**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_PATHS, PROTECTED_PATH_PREFIXES, SESSION_COOKIE } from "@/lib/auth/constants";
import { safeAuthNext } from "@/lib/auth/safe-auth-next";

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (isProtectedPath(pathname) && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPath(pathname) && hasSession && pathname !== "/contact") {
    const next = safeAuthNext(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/model/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/contact",
    "/profile",
    "/admin/:path*",
  ],
};
```

Note: `safeAuthNext` is a pure function with no Node-only imports — safe in Edge middleware.

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "$(cat <<'EOF'
Honor validated next when redirecting authed users off auth pages.

EOF
)"
```

---

### Task 5: Unified `AuthPanel` + pages

**Files:**
- Create: `src/features/auth/ui/AuthPanel.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/signup/page.tsx` (redirect only)
- Modify: `src/features/auth/index.ts`
- Delete: `src/features/auth/ui/LoginForm.tsx`
- Delete: `src/features/auth/ui/SignUpForm.tsx`

- [ ] **Step 1: Implement `AuthPanel`**

```tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/features/auth/ui/AuthShell";
import { logIn, signUp } from "@/lib/auth/client";
import { safeAuthNext } from "@/lib/auth/safe-auth-next";

type AuthMode = "signin" | "signup";

function modeFromSearch(raw: string | null): AuthMode {
  return raw === "signup" ? "signup" : "signin";
}

export function AuthPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = modeFromSearch(searchParams.get("mode"));
  const nextParam = searchParams.get("next");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setMode(nextMode: AuthMode) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "signup") params.set("mode", "signup");
    else params.delete("mode");
    const qs = params.toString();
    router.replace(qs ? `/login?${qs}` : "/login");
  }

  function nextHref(path: string) {
    const params = new URLSearchParams();
    if (nextParam) params.set("next", nextParam);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "signup" && password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setPending(true);
    try {
      if (mode === "signup") {
        await signUp({ email, password, name: name || undefined });
      } else {
        await logIn({ email, password });
      }
      router.push(safeAuthNext(nextParam));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <AuthShell
      title={isSignup ? "Create account" : "Sign in"}
      description={
        isSignup
          ? "Start uploading models and building your jewelry library."
          : "Access your workshop, models, and renders."
      }
      footer={
        <>
          {!isSignup ? (
            <p className="mt-2">
              <Link href={nextHref("/forgot-password")} className="hover:underline">
                Forgot password
              </Link>
              {" · "}
              <Link href="/contact" className="hover:underline">
                Contact us
              </Link>
            </p>
          ) : null}
        </>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-black/[0.04] p-1">
        <button
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            !isSignup ? "bg-white text-black shadow-sm" : "text-black/50"
          }`}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
            isSignup ? "bg-white text-black shadow-sm" : "text-black/50"
          }`}
          onClick={() => setMode("signup")}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {isSignup ? (
          <div className="space-y-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {isSignup ? (
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          ) : null}
        </div>
        {isSignup ? (
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
          {pending
            ? isSignup
              ? "Creating account…"
              : "Signing in…"
            : isSignup
              ? "Sign up"
              : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
```

- [ ] **Step 2: Login page uses `AuthPanel`**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPanel } from "@/features/auth";

export const metadata: Metadata = {
  title: "Sign in · DevJewels Studio",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-app-canvas" />}>
      <AuthPanel />
    </Suspense>
  );
}
```

- [ ] **Step 3: Signup page redirects**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sign up · DevJewels Studio",
};

type SignUpPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const nextRaw = params.next;
  const next = typeof nextRaw === "string" ? nextRaw : undefined;
  const qs = new URLSearchParams({ mode: "signup" });
  if (next) qs.set("next", next);
  redirect(`/login?${qs.toString()}`);
}
```

- [ ] **Step 4: Update barrel; delete old forms**

```ts
// src/features/auth/index.ts
export { AuthShell } from "./ui/AuthShell";
export { AuthPanel } from "./ui/AuthPanel";
export { ContactForm } from "./ui/ContactForm";
export { ForgotPasswordForm } from "./ui/ForgotPasswordForm";
export { ResetPasswordForm } from "./ui/ResetPasswordForm";
```

Delete `LoginForm.tsx` and `SignUpForm.tsx`. Grep for imports and fix leftovers.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/ui/AuthPanel.tsx src/app/login/page.tsx src/app/signup/page.tsx src/features/auth/index.ts
git rm src/features/auth/ui/LoginForm.tsx src/features/auth/ui/SignUpForm.tsx
git commit -m "$(cat <<'EOF'
Unify sign-in and sign-up on AuthPanel with mode toggle.

EOF
)"
```

---

### Task 6: Reset-password loading state

**Files:**
- Modify: `src/features/auth/ui/ResetPasswordForm.tsx`

- [ ] **Step 1: Add token status**

Replace empty-token first paint with three states:

```tsx
type TokenStatus = "loading" | "ready" | "missing";

const [token, setToken] = useState("");
const [tokenStatus, setTokenStatus] = useState<TokenStatus>("loading");

useEffect(() => {
  const resolved = readResetToken();
  setToken(resolved);
  setTokenStatus(resolved ? "ready" : "missing");
  if (window.location.search || window.location.hash) {
    window.history.replaceState({}, "", "/reset-password");
  }
}, []);

if (tokenStatus === "loading") {
  return (
    <AuthShell title="Checking link…" description="One moment while we verify your reset link.">
      <p className="text-sm text-black/45">Please wait…</p>
    </AuthShell>
  );
}

if (tokenStatus === "missing") {
  return (
    <AuthShell title="Invalid link" description="This password reset link is missing or expired.">
      <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
        Request a new link
      </Link>
    </AuthShell>
  );
}
```

Keep the rest of the form; still use `token` on submit.

- [ ] **Step 2: Commit**

```bash
git add src/features/auth/ui/ResetPasswordForm.tsx
git commit -m "$(cat <<'EOF'
Avoid invalid-link flash while reading reset token.

EOF
)"
```

---

### Task 7: Update CTAs + forgot-password `next` passthrough

**Files:**
- Modify: `src/components/landing/LandingHeader.tsx` — Start creating → `/login?mode=signup`
- Modify: `src/components/landing/LandingPage.tsx` — any `/signup` hrefs
- Modify: `src/features/billing/ui/PricingPage.tsx` — `/login?mode=signup&next=/pricing` (or keep `/signup?next=` and rely on redirect)
- Modify: `src/features/upload/ui/UploadSignInDialog.tsx` — signup link → `/login?mode=signup`
- Modify: `src/features/auth/ui/ForgotPasswordForm.tsx` — preserve `next` on “Back to sign in” if easy via searchParams

Prefer updating links to the canonical unified URL; `/signup` redirect remains for safety.

- [ ] **Step 1: Apply link updates**
- [ ] **Step 2: Commit**

```bash
git add src/components/landing/LandingHeader.tsx src/components/landing/LandingPage.tsx src/features/billing/ui/PricingPage.tsx src/features/upload/ui/UploadSignInDialog.tsx src/features/auth/ui/ForgotPasswordForm.tsx
git commit -m "$(cat <<'EOF'
Point auth CTAs at unified login signup mode.

EOF
)"
```

---

### Task 8: Verification

- [ ] **Step 1: Unit tests**

Run: `npx vitest run src/lib/__tests__/safe-auth-next.test.ts src/lib/__tests__/parse-auth-error.test.ts`

Expected: all PASS

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` (note: repo may have pre-existing errors; ensure none introduced in auth files)

- [ ] **Step 3: Manual smoke (when servers up)**

1. `/login` toggle Sign in ↔ Sign up preserves query
2. `/signup?next=/pricing` → `/login?mode=signup&next=/pricing` → after signup → `/pricing`
3. Open redirect `?next=https://evil.com` → lands `/dashboard`
4. Reset link with hash does not flash Invalid link
5. Stale cookie on `/dashboard` clears and reaches `/login?next=/dashboard`

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Unified `/login` + `mode=signup` | 5 |
| `/signup` redirect preserves `next` | 5 |
| Mode toggle preserves `next` | 5 |
| `safeAuthNext` / open redirect fix | 1, 5, 4 |
| Signup honors `next` | 5 |
| Readable FastAPI errors | 2 |
| Reset token loading state | 6 |
| Stale session clear + redirect | 3 |
| Middleware logged-in + `next` | 4 |
| CTA updates | 7 |
| Confirm password on signup | 5 |
| Keep AuthShell / no OAuth / no email verify | — out of scope, untouched |
