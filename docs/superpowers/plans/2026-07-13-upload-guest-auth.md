# Upload guest auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let guests prep CAD on `/upload-model` and sign in via modal only on Save, then auto-retry persist.

**Architecture:** Unprotect the upload page in middleware constants. Upload flow probes session before persist; opens a Dialog for login; retries save after success. CAD stays in React state.

**Tech Stack:** Next.js, existing `@/lib/auth/client`, shadcn Dialog

---

### Task 1: Unprotect upload-model page

**Files:**
- Modify: `src/lib/auth/constants.ts`
- Modify: `src/middleware.ts` (optional matcher cleanup)

- [ ] Remove `/upload-model` from `PROTECTED_PATH_PREFIXES`
- [ ] Remove `/upload-model/:path*` from middleware matcher (no longer needed)

### Task 2: Auth helper + sign-in dialog

**Files:**
- Create: `src/lib/auth/is-auth-required-error.ts`
- Create: `src/features/upload/ui/UploadSignInDialog.tsx`

- [ ] Helper detects “Authentication required” / 401-style messages
- [ ] Dialog form calls `logIn`, invokes `onSuccess`, links open in new tab

### Task 3: Wire flow + shell

**Files:**
- Modify: `src/features/upload/hooks/useUploadModelFlow.ts`
- Modify: `src/features/upload/ui/UploadModelShell.tsx`

- [ ] Session probe before save; auth dialog state + pending retry
- [ ] On auth error during persist, open dialog instead of bare error string
- [ ] Mount `UploadSignInDialog` in shell

### Task 4: Verify

- [ ] Typecheck touched files / smoke mentally: guest save → modal → login → continue
