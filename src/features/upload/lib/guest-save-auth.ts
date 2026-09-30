import { isAuthRequiredError } from "@/lib/auth/is-auth-required-error";

/**
 * Pure Save-gate used by useUploadModelFlow.
 * Extracted so Vitest can prove guest → auth → single persist without RTL.
 */
export type GuestSaveAuthDeps = {
  fetchMe: () => Promise<unknown>;
  persist: () => Promise<void>;
  /** Optional: called when opening the sign-in dialog. */
  onRequestSignIn?: () => void;
};

export type GuestSaveAuthState = {
  authDialogOpen: boolean;
  pendingSaveAfterAuth: boolean;
  saveFlowActive: boolean;
};

export function createGuestSaveAuth(deps: GuestSaveAuthDeps) {
  let authDialogOpen = false;
  let pendingSaveAfterAuth = false;
  let saveFlowActive = false;

  function snapshot(): GuestSaveAuthState {
    return { authDialogOpen, pendingSaveAfterAuth, saveFlowActive };
  }

  function requestSignInForSave() {
    pendingSaveAfterAuth = true;
    authDialogOpen = true;
    deps.onRequestSignIn?.();
  }

  function releaseSaveFlowIfIdle() {
    if (!pendingSaveAfterAuth) {
      saveFlowActive = false;
    }
  }

  async function handleSave(): Promise<"persisted" | "needs-auth" | "session-error" | "busy"> {
    if (saveFlowActive) return "busy";
    saveFlowActive = true;

    try {
      await deps.fetchMe();
    } catch (err) {
      if (isAuthRequiredError(err)) {
        requestSignInForSave();
        return "needs-auth";
      }
      saveFlowActive = false;
      return "session-error";
    }

    try {
      await deps.persist();
      return "persisted";
    } finally {
      releaseSaveFlowIfIdle();
    }
  }

  function handleAuthDialogOpenChange(open: boolean) {
    authDialogOpen = open;
    if (!open) {
      pendingSaveAfterAuth = false;
      saveFlowActive = false;
    }
  }

  async function handleAuthSuccess(): Promise<"persisted" | "noop"> {
    authDialogOpen = false;
    const shouldRetry = pendingSaveAfterAuth;
    pendingSaveAfterAuth = false;
    if (!shouldRetry) return "noop";
    try {
      await deps.persist();
      return "persisted";
    } finally {
      releaseSaveFlowIfIdle();
    }
  }

  /** Persist path that re-opens auth dialog on auth-classified persist errors. */
  async function persistCatchingAuth(): Promise<"persisted" | "needs-auth" | "save-error"> {
    try {
      await deps.persist();
      return "persisted";
    } catch (err) {
      if (isAuthRequiredError(err)) {
        requestSignInForSave();
        return "needs-auth";
      }
      return "save-error";
    }
  }

  return {
    snapshot,
    handleSave,
    handleAuthDialogOpenChange,
    handleAuthSuccess,
    persistCatchingAuth,
    /** Test/inspection helper — mirrors requestSignInForSave side effects. */
    requestSignInForSave,
  };
}

export async function attemptUploadSignIn(input: {
  email: string;
  password: string;
  logIn: (body: { email: string; password: string }) => Promise<unknown>;
  onSuccess: () => void | Promise<void>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await input.logIn({ email: input.email, password: input.password });
    await input.onSuccess();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Login failed" };
  }
}
