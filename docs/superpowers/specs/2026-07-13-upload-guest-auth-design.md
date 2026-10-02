# Upload guest prep + sign-in on Save

**Date:** 2026-07-13  
**Status:** Approved for implementation

## Goal

Guests can open `/upload-model`, drop CAD, preview, and edit layers without signing in. Auth is required only when they Save. Sign-in happens in a modal on the same page; after success, Save retries automatically with CAD/metadata still in memory.

## Decisions

| Topic | Choice |
|---|---|
| When to auth | Only on Save |
| Sign-in UI | Dialog on `/upload-model` |
| After login | Auto-retry Save |
| Persistence | Stay on page (React state); no IndexedDB |

## Access

- Remove `/upload-model` from `PROTECTED_PATH_PREFIXES`.
- Upload/register APIs remain session-gated.
- Landing CTAs can land on the live upload UI with no login bounce.

## Save flow

1. Validate name/SKU.
2. Probe session (`fetchMe`).
3. If authenticated → `persistUploadedModel` as today.
4. If guest or expired → open sign-in Dialog; keep phase `ready`.
5. On login success → close Dialog → immediately retry persist.
6. If persist throws auth error (401 / “Authentication required”) → same Dialog + pending retry path.

## Modal UX

- Email + password, Sign in via existing `logIn` client.
- Links: Sign up / Forgot password open in a new tab so CAD state is not lost.
- Inline errors; no full-page redirect.

## Out of scope

- Guest cloud upload before auth
- IndexedDB / draft restore across tabs
- Sign-up form inside the modal
