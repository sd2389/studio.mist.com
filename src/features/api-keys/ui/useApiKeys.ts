"use client";

import { useState } from "react";
import { createApiKey, revokeApiKey, type ApiKeyCreated, type ApiKeyList, type NewApiKey } from "@/lib/api/api-keys";
import { listedKey } from "../domain/api-keys";

function messageOf(failure: unknown, fallback: string): string {
  return failure instanceof Error && failure.message ? failure.message : fallback;
}

/**
 * The profile page's API keys: the list, making one (its secret held in this state only, for
 * the one time it is shown) and revoking one. The API checks the plan, the limit and the scopes.
 */
export function useApiKeys(initial: ApiKeyList) {
  const [keys, setKeys] = useState(initial.items);
  const [revealed, setRevealed] = useState<ApiKeyCreated | null>(null);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Makes a key and reveals its secret; false when the API refused. */
  async function create(body: NewApiKey): Promise<boolean> {
    // The secret showing is its key's only copy: it is put away before another key is made.
    if (revealed) return false;
    setCreating(true);
    setError(null);
    try {
      const created = await createApiKey(body);
      setKeys((current) => [listedKey(created), ...current]);
      setRevealed(created);
      return true;
    } catch (failure) {
      setError(messageOf(failure, "The key couldn't be created"));
      return false;
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: number): Promise<void> {
    setRevokingId(id);
    setError(null);
    try {
      await revokeApiKey(id);
      setKeys((current) => current.filter((key) => key.id !== id));
      setRevealed((current) => (current?.id === id ? null : current));
    } catch (failure) {
      setError(messageOf(failure, "The key couldn't be revoked"));
    } finally {
      setRevokingId(null);
    }
  }

  return {
    keys,
    maxActive: initial.max_active,
    revealed,
    dismissRevealed: () => setRevealed(null),
    creating,
    revokingId,
    error,
    create,
    revoke,
  };
}

export type ApiKeysState = ReturnType<typeof useApiKeys>;
