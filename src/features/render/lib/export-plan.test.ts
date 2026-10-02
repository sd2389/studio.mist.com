import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuotaBalances, UserBillingSnapshot } from "@/lib/billing/types";

const { fetchBillingAccount } = vi.hoisted(() => ({
  fetchBillingAccount: vi.fn<() => Promise<UserBillingSnapshot>>(),
}));
vi.mock("@/lib/billing/client", () => ({ fetchBillingAccount }));

const QUOTAS: QuotaBalances = {
  model_credits: 3,
  ai_image_credits: 150,
  render_credits: 25,
  custom_material_credits: 5,
  custom_asset_credits: 5,
  storage_bytes_used: 0,
  storage_bytes_limit: 1,
};

/** The snapshot the API sends for each tier (backend/app/features/billing/plans.py). */
function snapshot(tier: "free" | "grow" | "studio"): UserBillingSnapshot {
  const paid = tier !== "free";
  return {
    plan_tier: tier,
    plan_label: { free: "Free", grow: "Grow", studio: "Studio" }[tier],
    period_start: null,
    period_end: null,
    balances: QUOTAS,
    allotments: QUOTAS,
    features: {
      max_variants_per_model: 3,
      max_image_resolution: paid ? 8192 : 4096,
      max_polygons: 100_000,
      watermark_exports: !paid,
      embed_enabled: true,
      batch_export_enabled: paid,
      video_8k_enabled: paid,
    },
    stripe_customer_id: null,
    has_active_subscription: paid,
  };
}

/** A fresh module per test: a pending plan request is shared at module level. */
async function loadModule() {
  vi.resetModules();
  return import("./export-plan");
}

beforeEach(() => {
  fetchBillingAccount.mockReset();
});

describe("exportPlanFromSnapshot", () => {
  it("caps Free at 4096 px with the watermark and no Campaign Pack", async () => {
    const { exportPlanFromSnapshot } = await loadModule();
    expect(exportPlanFromSnapshot(snapshot("free"))).toEqual({
      label: "Free",
      maxEdge: 4096,
      watermark: true,
      campaignPack: false,
    });
  });

  it("gives Grow and Studio 8K, no watermark and the Campaign Pack", async () => {
    const { exportPlanFromSnapshot } = await loadModule();
    for (const tier of ["grow", "studio"] as const) {
      expect(exportPlanFromSnapshot(snapshot(tier))).toMatchObject({ maxEdge: 8192, watermark: false, campaignPack: true });
    }
  });

  it("allows the Campaign Pack by tier only", async () => {
    const { exportPlanFromSnapshot } = await loadModule();
    expect(exportPlanFromSnapshot({ ...snapshot("grow"), plan_tier: "enterprise" }).campaignPack).toBe(false);
  });
});

describe("loadExportPlan", () => {
  it("falls back to Free's limits when the account can't be read, and asks again next time", async () => {
    const { FREE_EXPORT_PLAN, loadExportPlan } = await loadModule();
    fetchBillingAccount.mockRejectedValueOnce(new Error("Unauthorized"));
    expect(await loadExportPlan()).toEqual(FREE_EXPORT_PLAN);
    fetchBillingAccount.mockResolvedValueOnce(snapshot("studio"));
    expect(await loadExportPlan()).toMatchObject({ label: "Studio", maxEdge: 8192 });
    expect(fetchBillingAccount).toHaveBeenCalledTimes(2);
  });

  it("shares one request between callers asking at once", async () => {
    const { loadExportPlan } = await loadModule();
    fetchBillingAccount.mockResolvedValue(snapshot("grow"));
    const [a, b] = await Promise.all([loadExportPlan(), loadExportPlan()]);
    expect(a).toBe(b);
    expect(fetchBillingAccount).toHaveBeenCalledTimes(1);
  });

  it("asks again once a request is done, so a sign-out or sign-in counts", async () => {
    const { FREE_EXPORT_PLAN, loadExportPlan } = await loadModule();
    fetchBillingAccount.mockResolvedValueOnce(snapshot("studio"));
    expect(await loadExportPlan()).toMatchObject({ label: "Studio" });
    fetchBillingAccount.mockRejectedValueOnce(new Error("Unauthorized"));
    expect(await loadExportPlan()).toEqual(FREE_EXPORT_PLAN);
  });
});

describe("plan gates", () => {
  it("refuses a Campaign Pack on Free", async () => {
    const { assertCampaignPackAllowed, exportPlanFromSnapshot, FREE_EXPORT_PLAN } = await loadModule();
    expect(() => assertCampaignPackAllowed(FREE_EXPORT_PLAN)).toThrow(/Grow and Studio/);
    expect(() => assertCampaignPackAllowed(exportPlanFromSnapshot(snapshot("grow")))).not.toThrow();
  });

  it("describes what Free holds back, and nothing for paid plans", async () => {
    const { exportPlanFromSnapshot, exportPlanNote, FREE_EXPORT_PLAN } = await loadModule();
    expect(exportPlanNote(FREE_EXPORT_PLAN)).toBe("Free plan exports up to 4K, with a MIST Studio watermark.");
    expect(exportPlanNote(exportPlanFromSnapshot(snapshot("studio")))).toBeNull();
  });
});
