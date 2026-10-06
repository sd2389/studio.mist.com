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
      max_video_fps: paid ? 60 : 30,
      max_video_seconds: paid ? 60 : 20,
      max_8k_video_seconds: paid ? 20 : 0,
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
  it("caps Free at 4096 px with the watermark, no Campaign Pack, and 30 fps and 20 s videos without 8K", async () => {
    const { exportPlanFromSnapshot, FREE_EXPORT_PLAN } = await loadModule();
    expect(exportPlanFromSnapshot(snapshot("free"))).toEqual({
      label: "Free",
      maxEdge: 4096,
      watermark: true,
      campaignPack: false,
      video: { maxFps: 30, maxSeconds: 20, max8kSeconds: 0 },
    });
    expect(FREE_EXPORT_PLAN).toEqual(exportPlanFromSnapshot(snapshot("free")));
  });

  it("gives Grow and Studio 8K, no watermark, the Campaign Pack, and the API's video caps", async () => {
    const { exportPlanFromSnapshot } = await loadModule();
    for (const tier of ["grow", "studio"] as const) {
      expect(exportPlanFromSnapshot(snapshot(tier))).toMatchObject({
        maxEdge: 8192,
        watermark: false,
        campaignPack: true,
        video: { maxFps: 60, maxSeconds: 60, max8kSeconds: 20 },
      });
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

  it("adds a server video's frame rate and length to what Free holds back", async () => {
    const { exportPlanFromSnapshot, exportPlanNote, FREE_EXPORT_PLAN } = await loadModule();
    expect(exportPlanNote(FREE_EXPORT_PLAN, { video: true })).toBe(
      "Free plan exports videos up to 4K, 30 fps and 20 s, with a MIST Studio watermark.",
    );
    expect(exportPlanNote(exportPlanFromSnapshot(snapshot("grow")), { video: true })).toBeNull();
  });
});

describe("a server video's caps", () => {
  it("lock what the plan's videos can't be: Free's above 30 fps and at 8K, every plan's above its cap", async () => {
    const { exportPlanFromSnapshot, fitsVideoFps, fitsVideoSize, FREE_EXPORT_PLAN } = await loadModule();
    const grow = exportPlanFromSnapshot(snapshot("grow"));

    expect([24, 30, 48, 60].filter((fps) => fitsVideoFps(FREE_EXPORT_PLAN, fps))).toEqual([24, 30]);
    expect(fitsVideoFps(grow, 60)).toBe(true);
    expect(fitsVideoSize(FREE_EXPORT_PLAN, 3840, 2160)).toBe(true);
    expect(fitsVideoSize(FREE_EXPORT_PLAN, 7680, 4320)).toBe(false);
    expect(fitsVideoSize(grow, 7680, 4320)).toBe(true);
    // Above 4K's size but within Free's 4096 px edge: 8K video, which Free has none of.
    expect(fitsVideoSize(FREE_EXPORT_PLAN, 4096, 2304)).toBe(false);
  });

  it("bring a rate picked for the browser's recorder down to the server's fastest", async () => {
    const { jobVideoFps } = await loadModule();
    expect([24, 30, 60, 90, 120].map((fps) => jobVideoFps(fps))).toEqual([24, 30, 60, 60, 60]);
  });

  it("are as long as the plan's videos run at that size: shorter at 8K, none at 8K on Free", async () => {
    const { exportPlanFromSnapshot, maxVideoSeconds, FREE_EXPORT_PLAN } = await loadModule();
    const studio = exportPlanFromSnapshot(snapshot("studio"));

    expect(maxVideoSeconds(FREE_EXPORT_PLAN, 3840, 2160)).toBe(20);
    expect(maxVideoSeconds(FREE_EXPORT_PLAN, 7680, 4320)).toBe(0);
    expect(maxVideoSeconds(studio, 1920, 1080)).toBe(60);
    expect(maxVideoSeconds(studio, 7680, 4320)).toBe(20);
  });
});
