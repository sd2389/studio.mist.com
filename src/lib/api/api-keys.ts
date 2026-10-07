import { apiDelete, apiGet, apiPost } from "@/lib/api/client";

/*
 * API keys for the customer API (ADR 0006, Phase G), through the Next proxies in
 * src/app/api/api-keys/. The types mirror backend/app/schemas/api_key.py.
 */

/** What a key may do on /v1, as backend/app/features/api_keys/keys.py lists them. */
export const API_SCOPES = [
  "batches:read",
  "batches:write",
  "render_jobs:read",
  "render_jobs:write",
  "scenes:read",
  "webhooks:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

/** A key as the list shows it: never its secret. */
export type ApiKey = {
  id: number;
  name: string;
  /** Not secret: the key's second part, `mist_<prefix>_…`, to tell keys apart. */
  prefix: string;
  scopes: ApiScope[];
  created_at: string;
  last_used_at: string | null;
  /** Null: until it is revoked. */
  expires_at: string | null;
  revoked_at: string | null;
};

/** The answer to making a key: the only time its whole key (`secret`) is shown. */
export type ApiKeyCreated = ApiKey & { secret: string };

export type ApiKeyList = {
  /** The keys not revoked, the newest first; expired ones too. */
  items: ApiKey[];
  /** Most keys that may be active (neither revoked nor expired) at once. */
  max_active: number;
};

export type NewApiKey = {
  name: string;
  scopes: ApiScope[];
  /** 1 to 365; null for a key that works until it is revoked. */
  expires_in_days: number | null;
};

const API_KEYS_PATH = "/api/api-keys";

export function listApiKeys(): Promise<ApiKeyList> {
  return apiGet<ApiKeyList>(API_KEYS_PATH);
}

export function createApiKey(body: NewApiKey): Promise<ApiKeyCreated> {
  return apiPost<ApiKeyCreated>(API_KEYS_PATH, body);
}

/** Refused by the API from the next request on. */
export function revokeApiKey(id: number): Promise<ApiKey> {
  return apiDelete<ApiKey>(`${API_KEYS_PATH}/${id}`);
}
