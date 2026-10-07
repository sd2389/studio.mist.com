import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiKey, ApiKeyCreated } from "@/lib/api/api-keys";
import { drawnButton, drawnButtons } from "@/test/recording-button";
import { DEFAULT_DRAFT, newKeyBody, type ApiKeyDraft } from "../domain/api-keys";
import type { ApiKeyDraftState } from "./useApiKeyDraft";
import type { ApiKeysState } from "./useApiKeys";

/*
 * The profile page's API keys (ADR 0006 G1): make a key, see its secret once with a copy button,
 * list keys by name and prefix (never a secret), revoke one. The API checks plan, limit and scopes.
 */

vi.mock("@/components/ui/button", async (importOriginal) =>
  (await import("@/test/recording-button")).recordingButtonModule(await importOriginal()),
);

let keysState: ApiKeysState;
let draftState: ApiKeyDraftState;
vi.mock("./useApiKeys", () => ({ useApiKeys: () => keysState }));
vi.mock("./useApiKeyDraft", () => ({ useApiKeyDraft: () => draftState }));

type DialogProps = { keyName: string; revoking: boolean; onConfirm: () => void };
const dialogs: DialogProps[] = [];
vi.mock("./RevokeApiKeyDialog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./RevokeApiKeyDialog")>();
  return {
    RevokeApiKeyDialog: (props: DialogProps) => {
      dialogs.push(props);
      return <actual.RevokeApiKeyDialog {...props} />;
    },
  };
});

const { ApiKeysSection } = await import("./ApiKeysSection");

const SECRET = `mist_k3x9q2ab_${"7Fq".repeat(14)}Z`;
const WHOLE_KEY = /mist_[a-z0-9]{8}_[0-9A-Za-z]{43}/;
const DAY = 86_400_000;

function apiKey(fields: Partial<ApiKey> & Pick<ApiKey, "id" | "name" | "prefix">): ApiKey {
  return {
    scopes: ["batches:read", "batches:write"],
    created_at: new Date(Date.now() - 3 * DAY).toISOString(),
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    ...fields,
  };
}

const ERP = apiKey({ id: 2, name: "ERP", prefix: "k3x9q2ab", scopes: ["batches:read"] });
const OLD = apiKey({ id: 1, name: "Old sync", prefix: "p0q1r2s3", expires_at: new Date(Date.now() - DAY - 60_000).toISOString() });
const CREATED: ApiKeyCreated = { ...ERP, secret: SECRET };

function keysOf(fields: Partial<ApiKeysState> = {}): ApiKeysState {
  return {
    keys: [ERP, OLD],
    maxActive: 10,
    revealed: null,
    dismissRevealed: vi.fn(),
    creating: false,
    revokingId: null,
    error: null,
    create: vi.fn(async () => true),
    revoke: vi.fn(async () => {}),
    ...fields,
  };
}

function draftOf(fields: Partial<ApiKeyDraft> = {}): ApiKeyDraftState {
  const draft = { ...DEFAULT_DRAFT, ...fields };
  return { draft, body: newKeyBody(draft), setName: vi.fn(), toggleScope: vi.fn(), setExpiry: vi.fn(), reset: vi.fn() };
}

function section(canCreate = true): string {
  return renderToStaticMarkup(<ApiKeysSection initial={{ items: [], max_active: 10 }} canCreate={canCreate} />);
}

beforeEach(() => {
  keysState = keysOf();
  draftState = draftOf();
  drawnButtons.length = 0;
  dialogs.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ApiKeysSection", () => {
  it("lists each key by name and prefix with its scopes, use and expiry, and never a secret", () => {
    const html = section();

    expect(html).toContain("ERP");
    expect(html).toContain("mist_k3x9q2ab_…");
    expect(html).toContain("batches:read");
    expect(html).toContain("Never used");
    expect(html).toContain("Created 3 days ago");
    expect(html).toContain("No expiry");
    expect(html).toContain("Expired yesterday");
    expect(html).toContain(">Expired</");
    expect(html).toContain("1 of 10 active");
    expect(html).not.toMatch(WHOLE_KEY);
  });

  it("shows a new key's secret once, with a copy button and a note it won't be shown again", async () => {
    keysState = keysOf({ revealed: CREATED });
    const html = section();

    expect(html.split(SECRET)).toHaveLength(2);
    expect(html).toContain("Copy key");
    expect(html).toContain("you won&#x27;t see this key again");

    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("window", { setTimeout: vi.fn() });
    drawnButton("Copy key").click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET));

    drawnButton("Done").click();
    expect(keysState.dismissRevealed).toHaveBeenCalled();
  });

  it("puts the secret away for good once it is done with", () => {
    expect(section()).not.toContain(SECRET);
    expect(drawnButtons.map((button) => button.text)).not.toContain("Copy key");
  });

  it("makes a key of the form, then clears the form", async () => {
    draftState = draftOf({ name: " Catalogue sync ", expiresInDays: 90 });
    section();

    const create = drawnButton("Create key");
    expect(create.disabled).toBe(false);
    create.click();

    expect(keysState.create).toHaveBeenCalledWith({
      name: "Catalogue sync",
      scopes: ["batches:read", "batches:write"],
      expires_in_days: 90,
    });
    await vi.waitFor(() => expect(draftState.reset).toHaveBeenCalled());
  });

  it("keeps the form when the API refuses, and says why", async () => {
    keysState = keysOf({ create: vi.fn(async () => false), error: "At most 10 active API keys: revoke one first" });
    draftState = draftOf({ name: "ERP" });
    const html = section();

    expect(html).toContain("At most 10 active API keys: revoke one first");
    drawnButton("Create key").click();
    await vi.waitFor(() => expect(keysState.create).toHaveBeenCalled());
    expect(draftState.reset).not.toHaveBeenCalled();
  });

  it("can't make a key without a name or a scope, while one is being made, or at the limit", () => {
    section();
    expect(drawnButton("Create key").disabled).toBe(true);

    draftState = draftOf({ name: "ERP", scopes: [] });
    section();
    expect(drawnButton("Create key").disabled).toBe(true);

    draftState = draftOf({ name: "ERP" });
    keysState = keysOf({ creating: true });
    section();
    expect(drawnButton("Create key").disabled).toBe(true);

    const tenActive = Array.from({ length: 10 }, (_, index) => apiKey({ id: index + 1, name: `Key ${index}`, prefix: `abcd000${index}` }));
    keysState = keysOf({ keys: tenActive });
    const html = section();
    expect(drawnButton("Create key").disabled).toBe(true);
    expect(html).toContain("10 of 10 active");
    expect(html).toContain("10 keys are active, the most there may be");
  });

  it("offers every scope and the expiry choices", () => {
    const html = section();

    for (const scope of ["batches:write", "render_jobs:read", "render_jobs:write", "scenes:read", "webhooks:write"]) {
      expect(html).toContain(scope);
    }
    for (const label of ["No expiry", "30 days", "90 days", "1 year"]) {
      expect(html).toContain(`${label}</button>`);
    }
  });

  it("offers the upgrade on a plan without the API, and still lists and revokes keys", () => {
    const html = section(false);

    expect(html).toContain("API keys come with the Studio plan.");
    expect(html).toContain('href="/pricing"');
    expect(drawnButtons.map((button) => button.text)).not.toContain("Create key");
    expect(drawnButtons.filter((button) => button.text === "Revoke")).toHaveLength(2);
  });

  it("revokes the key its dialog confirms, and shows it revoking", () => {
    keysState = keysOf({ revokingId: 1 });
    section();

    const [erp, old] = dialogs;
    expect([erp.keyName, erp.revoking, old.keyName, old.revoking]).toEqual(["ERP", false, "Old sync", true]);
    expect(drawnButton("Revoking…").disabled).toBe(true);
    erp.onConfirm();
    expect(keysState.revoke).toHaveBeenCalledWith(2);
  });

  it("says when there are no keys yet", () => {
    keysState = keysOf({ keys: [] });

    expect(section()).toContain("No API keys yet.");
  });
});
