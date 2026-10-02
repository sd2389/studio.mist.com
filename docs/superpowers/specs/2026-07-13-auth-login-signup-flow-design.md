# Auth Login / Signup Flow — Design

**Date:** 2026-07-13  
**Status:** Approved — awaiting implementation plan  
**Owner:** Smit Desai  
**Architecture rules:** [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md), [`docs/CODE-STANDARDS.md`](../../CODE-STANDARDS.md)

---

## 1. Overview

Login and signup currently feel broken: incomplete `next` handling, open redirects, awkward page hopping, opaque API errors, and a reset-password first-paint flash. This design unifies sign-in and sign-up on one surface and hardens the post-auth redirect and session edge cases.

**Locked decisions (brainstorming)**

| Decision | Choice |
|----------|--------|
| Scope | Flow bugs **and** UX polish |
| UI structure | Unified page with Sign in / Sign up toggle |
| URL model | `/login` + `?mode=signup`; `/signup` redirects |
| Forgot / reset / contact | Stay separate pages |
| Visual redesign | Keep existing `AuthShell`; no ice-panel redesign |
| Out of scope | Email verification, OAuth, auth modals |

**Non-goals (v1)**

- Email verification or magic-link login
- OAuth / SSO
- Auth as a modal over landing
- Full visual redesign of auth marketing panel
- Middleware-level remote session validation on every request (too expensive; see §4)

---

## 2. Success criteria

1. **One auth surface** — Users can switch Sign in ↔ Sign up without losing context or `next`.
2. **Deep links work** — Pricing/landing CTAs that pass `?next=…` land correctly after both login and signup.
3. **Safe redirects** — `next` only allows same-origin relative paths; open redirects are impossible.
4. **Readable errors** — FastAPI validation `detail` arrays never surface as `[object Object]`.
5. **No reset flash** — Reset-password page does not briefly show “Invalid link” while reading the token.
6. **Stale sessions recover** — Protected pages that fail `/auth/me` clear the cookie and return the user to login with `next` preserved.
7. **No regressions** — Existing BFF cookie session, forgot/reset/contact, and logout still work.

---

## 3. Page structure

### Primary surface

- **`/login`** — Sign in (default) or sign up when `?mode=signup`.
- Mode control lives on the page (segmented control or equivalent text toggle).
- Switching mode uses `router.replace` and **preserves** other query params (`next`, etc.).
- Title/description update with mode; fields differ only as needed (see §5).

### Compatibility

- **`/signup`** — Permanent redirect (or Next.js redirect) to `/login?mode=signup`, copying `next` if present.
- Existing bookmarks and CTAs that use `/signup` keep working via redirect.
- Preferred new CTAs: `/login?mode=signup` (optional; redirect covers `/signup`).

### Related pages (unchanged routes)

| Page | Behavior change |
|------|-----------------|
| `/forgot-password` | Keep; link back to `/login` preserving `next` when present |
| `/reset-password` | Fix token-read first paint; success → `/login` |
| `/contact` | Unchanged (middleware already exempts logged-in redirect) |

### Entry points to update

- Landing header / hero signup CTAs
- Pricing unauthenticated CTAs (`/signup?next=/pricing` still works via redirect)
- `UploadSignInDialog` signup link
- Middleware auth-path list (keep `/signup` while redirect exists)

---

## 4. Redirects & sessions

### Validated `next`

Shared helper (client + server-safe pure function), e.g. `safeAuthNext(raw, fallback = "/dashboard")`:

- Accept only strings that start with a single `/`
- Reject `//…`, protocol-relative, absolute URLs (`http:`, `https:`), and backslash tricks
- Reject path traversal tricks that escape the app (optional: allowlist known app prefixes; minimum bar is path-only same-origin relative)
- Fallback: `/dashboard`

### Post-auth navigation

- **Login** and **signup** both call the same helper with `searchParams.get("next")`.
- After success: `router.push(safeNext)` + `router.refresh()`.
- Mode toggle and all cross-links **never drop** `next`.

### Middleware (keep light)

- Keep **cookie presence** check for protected vs auth paths (no remote `/me` in middleware).
- Auth paths with a cookie still redirect away (except `/contact`).
- When redirecting *to* login from a protected path, set `next` to the attempted pathname.
- Include `/login` (and `/signup` while retained) in the matcher as today.

### Stale session recovery

When a protected **page** loads and `fetchCurrentUser()` returns null while a cookie may still be present:

1. Clear `studio_session` cookie (server-side response / redirect path).
2. Redirect to `/login?next=<validated path>`.

Apply consistently on dashboard, profile, admin shells — any protected RSC that already (or should) call `fetchCurrentUser`. Prefer one small shared helper (e.g. `requirePageUser(nextPath)`) over copy-paste.

Client API 401s remain as today; full global auth context is out of scope.

### Logged-in visit to `/login`

- If a cookie is present and `next` is valid → redirect to that `next`.
- Else if a cookie is present → redirect to `/dashboard` (current behavior).

---

## 5. UI, forms & errors

### Component shape

| Unit | Responsibility |
|------|----------------|
| `AuthShell` | Existing layout (marketing panel + form column) — kept |
| `AuthPanel` (new) | Mode toggle, title/copy, form fields, submit, footer links |
| `safeAuthNext` | Pure redirect validation |
| `parseAuthError` (or improved `upstreamError` + client) | Human-readable errors from API bodies |
| `/signup` page | Thin redirect only |
| Forgot / Reset / Contact forms | Stay separate; small polish only where noted |

`LoginForm` / `SignUpForm` are replaced by `AuthPanel` (or become thin wrappers that render it — prefer delete to avoid drift).

### Fields

| Mode | Fields |
|------|--------|
| Sign in | Email, password |
| Sign up | Name (optional), email, password (min 8), **confirm password** (required match) |

### UX details

- Footer: forgot password + contact on sign-in; “switch mode” is the primary toggle (not a buried text link alone).
- Pending/disabled submit while request in flight.
- Signup password helper text: “At least 8 characters.”

### Error parsing

- Normalize FastAPI `detail` when it is:
  - a string
  - an array of `{ msg }` / `{ loc, msg }` objects → join messages
  - nested `error` / `message` keys
- Client `authRequest` and server `upstreamError` share the same normalization logic (extract pure function under `src/lib/auth/`).

### Reset password flash

- Introduce explicit token resolve states: `loading` → `ready` | `missing`.
- While `loading`, show a neutral “Checking link…” (or spinner) in `AuthShell`, **not** “Invalid link.”
- Only after client read of hash/query token: show form or invalid state.
- Keep stripping token from URL via `history.replaceState` after read.

---

## 6. Data flow

```
Browser  →  POST /api/auth/login|signup  →  FastAPI /auth/login|signup
         ←  Set-Cookie: studio_session   ←  { user, token }
Client   →  safeAuthNext(next) → router.push + refresh
```

No change to cookie attributes (httpOnly, sameSite lax, 30-day maxAge, secure in production). No React AuthContext. Token never exposed to JS.

---

## 7. Testing / verification

Manual / smoke:

1. Sign in → lands on dashboard.
2. Sign up → lands on dashboard; confirm password mismatch shows inline error.
3. Visit `/signup?next=/pricing` → URL becomes login with mode=signup and next preserved → after signup lands on `/pricing`.
4. Protected route while logged out → `/login?next=…` → after login returns there.
5. Mode toggle preserves `next`.
6. Open redirect attempts (`next=//evil.com`, `next=https://evil.com`) fall back to dashboard.
7. Reset link with `#token=…` never flashes “Invalid link” on first paint.
8. Stale cookie on `/dashboard` (or profile) clears and returns to login.
9. Forgot password / contact / logout still work.

Backend API contracts unchanged; existing `backend/tests/test_auth.py` should still pass.

---

## 8. File / ownership touchpoints

Expected primary edits (implementation plan will sequence):

- `src/features/auth/ui/` — `AuthPanel`, retire login/signup form duplication; reset flash fix
- `src/app/login/page.tsx`, `src/app/signup/page.tsx` — unified page + redirect
- `src/lib/auth/` — `safeAuthNext`, error normalize, optional `requirePageUser`
- `src/middleware.ts` — auth-path / logged-in `next` behavior as needed
- Protected app pages — stale session clear + redirect consistency
- Landing / pricing / upload dialog links — point at unified URLs where practical
- `src/features/auth/index.ts` — barrel exports

No FastAPI router changes required for v1 unless error-shape helpers live only on the BFF.

---

## 9. Open implementation notes

- Prefer KISS: one `AuthPanel` client component rather than a mode machine with many files.
- Confirm-password is client-only validation; API still receives a single `password`.
- `/signup` redirect should be server-side (`redirect()` in page or `next.config` redirect) so it works without JS.
