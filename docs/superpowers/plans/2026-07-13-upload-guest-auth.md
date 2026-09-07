# Upload guest auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let guests prep CAD on `/upload-model` and sign in via modal only on Save, then auto-retry persist.

**Architecture:** Unprotect the upload page in middleware constants. Upload flow probes session before persist; opens a Dialog for login; retries save after success. CAD stays in React state.

**Tech Stack:** Next.js, existing `@/lib/auth/client`, shadcn Dialog

---

### Task 1: Unprotect upload-model page

**Files:**
- Modify: `src/lib/auth/constants.ts`
- Modify: `src/middleware.ts` (optional matcher cleanup)

- [x] Remove `/upload-model` from `PROTECTED_PATH_PREFIXES`
- [x] Remove `/upload-model/:path*` from middleware matcher (no longer needed)

### Task 2: Auth helper + sign-in dialog

**Files:**
- Create: `src/lib/auth/is-auth-required-error.ts`
- Create: `src/features/upload/ui/UploadSignInDialog.tsx`

- [x] Helper detects “Authentication required” / 401-style messages
- [x] Dialog form calls `logIn`, invokes `onSuccess`, links open in new tab

### Task 3: Wire flow + shell

**Files:**
- Modify: `src/features/upload/hooks/useUploadModelFlow.ts`
- Modify: `src/features/upload/ui/UploadModelShell.tsx`

- [x] Session probe before save; auth dialog state + pending retry
- [x] On auth error during persist, open dialog instead of bare error string
- [x] Mount `UploadSignInDialog` in shell

### Task 4: Verify

- [x] Typecheck touched files / smoke mentally: guest save → modal → login → continue

**Verified 2026-09-06:** `npx tsc --noEmit` clean, `npm run test` 73 passed, `npm run check:boundaries` OK, no ESLint errors in touched files. Traced both 401 shapes: `requireSessionApi` returns `Authentication required` on the persist path; `/api/auth/me` passes FastAPI's `Not authenticated` (no token) and `Invalid or expired session` (stale token) through verbatim. The stale-token message did not match the original helper, so a session that expired mid-session dead-ended on "Could not verify session" instead of opening the dialog. Fixed by having `authRequest` throw a status-carrying `AuthRequestError` and keying `isAuthRequiredError` off status 401 first (message regex broadened as fallback for `persist-model` errors). Covered by `src/lib/__tests__/is-auth-required-error.test.ts`.
