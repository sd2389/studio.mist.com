import { describe, expect, it } from "vitest";
import type { ApiKey } from "@/lib/api/api-keys";
import {
  activeKeyCount,
  DEFAULT_DRAFT,
  isKeyExpired,
  keyExpiryLabel,
  keyUsageLabel,
  listedKey,
  maskedKey,
  newKeyBody,
  toggledScopes,
} from "./api-keys";

const NOW = Date.parse("2026-10-07T12:00:00Z");

function apiKey(fields: Partial<ApiKey> = {}): ApiKey {
  return {
    id: 1,
    name: "ERP",
    prefix: "k3x9q2ab",
    scopes: ["batches:read"],
    created_at: "2026-10-01T09:00:00Z",
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    ...fields,
  };
}

describe("a new key's request", () => {
  it("names the key trimmed, with its scopes, and no expiry for 'No expiry'", () => {
    expect(newKeyBody({ name: "  Catalogue sync ", scopes: ["batches:read", "batches:write"], expiresInDays: 0 })).toEqual({
      name: "Catalogue sync",
      scopes: ["batches:read", "batches:write"],
      expires_in_days: null,
    });
    expect(newKeyBody({ name: "ERP", scopes: ["scenes:read"], expiresInDays: 90 })?.expires_in_days).toBe(90);
  });

  it("can't be sent without a name or a scope, or with a name over 100 characters", () => {
    expect(newKeyBody(DEFAULT_DRAFT)).toBeNull();
    expect(newKeyBody({ ...DEFAULT_DRAFT, name: "   " })).toBeNull();
    expect(newKeyBody({ ...DEFAULT_DRAFT, name: "ERP", scopes: [] })).toBeNull();
    expect(newKeyBody({ ...DEFAULT_DRAFT, name: "x".repeat(101) })).toBeNull();
  });

  it("starts with batch reads and writes, and toggles scopes in the API's order", () => {
    expect(DEFAULT_DRAFT.scopes).toEqual(["batches:read", "batches:write"]);
    expect(toggledScopes(["scenes:read"], "batches:read")).toEqual(["batches:read", "scenes:read"]);
    expect(toggledScopes(["batches:read", "scenes:read"], "batches:read")).toEqual(["scenes:read"]);
  });
});

describe("a listed key", () => {
  it("shows its prefix, never a secret", () => {
    expect(maskedKey("k3x9q2ab")).toBe("mist_k3x9q2ab_…");
    const created = { ...apiKey(), secret: "mist_k3x9q2ab_" + "s".repeat(43) };
    expect(listedKey(created)).toEqual(apiKey());
    expect(JSON.stringify(listedKey(created))).not.toContain("sss");
  });

  it("is expired from its expiry on, and then no longer counts as active", () => {
    const keys = [
      apiKey({ id: 1 }),
      apiKey({ id: 2, expires_at: "2026-10-08T12:00:00Z" }),
      apiKey({ id: 3, expires_at: "2026-10-07T12:00:00Z" }),
    ];
    expect(keys.map((key) => isKeyExpired(key, NOW))).toEqual([false, false, true]);
    expect(activeKeyCount(keys, NOW)).toBe(2);
  });

  it("says when it was last used and when it expires", () => {
    expect(keyUsageLabel(apiKey())).toBe("Never used");
    expect(keyUsageLabel(apiKey({ last_used_at: new Date(Date.now() - 3 * 60_000).toISOString() }))).toBe("Last used 3 minutes ago");
    expect(keyExpiryLabel(apiKey())).toBe("No expiry");
    expect(keyExpiryLabel(apiKey({ expires_at: new Date(Date.now() + 2 * 86_400_000 + 60_000).toISOString() }))).toBe(
      "Expires in 2 days",
    );
    expect(keyExpiryLabel(apiKey({ expires_at: new Date(Date.now() - 86_400_000 - 60_000).toISOString() }))).toBe(
      "Expired yesterday",
    );
  });
});
