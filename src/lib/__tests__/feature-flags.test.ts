import { describe, expect, it } from "vitest";
import { isFeatureEnabled } from "@/lib/feature-flags/is-enabled";

describe("isFeatureEnabled", () => {
  it("keeps server exports off until the API turns them on", () => {
    expect(isFeatureEnabled(null, "server_exports")).toBe(false);
    expect(isFeatureEnabled({ flags: {} }, "server_exports")).toBe(false);
    expect(isFeatureEnabled({ flags: { server_exports: false } }, "server_exports")).toBe(false);
    expect(isFeatureEnabled({ flags: { server_exports: true } }, "server_exports")).toBe(true);
  });

  it("keeps the bulk pipeline off until the API turns it on", () => {
    expect(isFeatureEnabled(null, "bulk_pipeline")).toBe(false);
    expect(isFeatureEnabled({ flags: {} }, "bulk_pipeline")).toBe(false);
    expect(isFeatureEnabled({ flags: { bulk_pipeline: true } }, "bulk_pipeline")).toBe(true);
  });

  it("leaves every other flag on unless the API says otherwise", () => {
    expect(isFeatureEnabled(null, "embed")).toBe(true);
    expect(isFeatureEnabled({ flags: {} }, "embed")).toBe(true);
    expect(isFeatureEnabled({ flags: { embed: false } }, "embed")).toBe(false);
  });
});
