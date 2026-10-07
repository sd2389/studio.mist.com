import type { ChipOption } from "@/components/ui/chip";
import { API_SCOPES, type ApiKey, type ApiKeyCreated, type ApiScope, type NewApiKey } from "@/lib/api/api-keys";
import { formatRelativeTime, parseApiTime } from "@/lib/relative-time";

/** A new key's form: what `newKeyBody` turns into the request. */
export type ApiKeyDraft = {
  name: string;
  scopes: ApiScope[];
  /** 0: no expiry. */
  expiresInDays: number;
};

export const DEFAULT_DRAFT: ApiKeyDraft = { name: "", scopes: ["batches:read", "batches:write"], expiresInDays: 0 };

export const EXPIRY_OPTIONS: readonly ChipOption<number>[] = [
  { value: 0, label: "No expiry" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "1 year" },
];

/** The most characters a key's name may have (the API's limit). */
export const MAX_NAME_LENGTH = 100;

/** How the list shows a key: its non-secret part, never the secret. */
export function maskedKey(prefix: string): string {
  return `mist_${prefix}_…`;
}

export function isKeyExpired(key: ApiKey, now: number = Date.now()): boolean {
  return key.expires_at !== null && parseApiTime(key.expires_at).getTime() <= now;
}

/** Keys that count toward the limit: not expired (the list has no revoked ones). */
export function activeKeyCount(keys: readonly ApiKey[], now: number = Date.now()): number {
  return keys.filter((key) => !isKeyExpired(key, now)).length;
}

export function keyUsageLabel(key: ApiKey): string {
  return key.last_used_at ? `Last used ${formatRelativeTime(key.last_used_at)}` : "Never used";
}

export function keyExpiryLabel(key: ApiKey, now: number = Date.now()): string {
  if (key.expires_at === null) return "No expiry";
  const when = formatRelativeTime(key.expires_at);
  return isKeyExpired(key, now) ? `Expired ${when}` : `Expires ${when}`;
}

/** The scopes with `scope` added or taken out, in the API's order. */
export function toggledScopes(scopes: readonly ApiScope[], scope: ApiScope): ApiScope[] {
  const next = scopes.includes(scope) ? scopes.filter((each) => each !== scope) : [...scopes, scope];
  return API_SCOPES.filter((each) => next.includes(each));
}

/** The request for a draft, or null while it can't be sent (no name, no scope). */
export function newKeyBody(draft: ApiKeyDraft): NewApiKey | null {
  const name = draft.name.trim();
  if (!name || name.length > MAX_NAME_LENGTH || draft.scopes.length === 0) return null;
  return { name, scopes: draft.scopes, expires_in_days: draft.expiresInDays > 0 ? draft.expiresInDays : null };
}

/** A new key as the list keeps it: without the secret, which only the reveal holds. */
export function listedKey({ secret, ...key }: ApiKeyCreated): ApiKey {
  void secret;
  return key;
}
