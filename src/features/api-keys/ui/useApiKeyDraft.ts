"use client";

import { useState } from "react";
import type { ApiScope } from "@/lib/api/api-keys";
import { DEFAULT_DRAFT, newKeyBody, toggledScopes, type ApiKeyDraft } from "../domain/api-keys";

/** The new key form: its name, scopes and expiry, and the request they make (null until valid). */
export function useApiKeyDraft() {
  const [draft, setDraft] = useState<ApiKeyDraft>(DEFAULT_DRAFT);
  return {
    draft,
    body: newKeyBody(draft),
    setName: (name: string) => setDraft((current) => ({ ...current, name })),
    toggleScope: (scope: ApiScope) => setDraft((current) => ({ ...current, scopes: toggledScopes(current.scopes, scope) })),
    setExpiry: (expiresInDays: number) => setDraft((current) => ({ ...current, expiresInDays })),
    reset: () => setDraft(DEFAULT_DRAFT),
  };
}

export type ApiKeyDraftState = ReturnType<typeof useApiKeyDraft>;
