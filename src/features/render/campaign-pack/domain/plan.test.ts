import { describe, expect, it } from "vitest";
import { poseAngleId } from "./angles";
import { DEFAULT_CAMPAIGN_PACK_CONFIG } from "./defaults";
import { metalSlug, packRootName, relativeTo, sanitizeSegment } from "./naming";
import { planCampaignPack } from "./plan";
import type { CampaignPackConfig, PackJob, PlanContext, SavedPoseLike } from "./types";

const context = (overrides: Partial<PlanContext["identity"]> = {}, savedPoses: SavedPoseLike[] = []): PlanContext => ({
  identity: { modelId: "mist-solitaire", sku: "MS-001", name: "Mist Solitaire", ...overrides },
  savedPoses,
});

function outputs(job: PackJob): string[] {
  if (job.kind === "still") return [job.jpgPath, job.pngPath].filter((path): path is string => Boolean(path));
  if (job.kind === "spin") return job.framePaths;
  return [job.path];
}

const allPaths = (jobs: PackJob[]) => jobs.flatMap(outputs);

describe("planCampaignPack — defaults", () => {
  const plan = planCampaignPack(DEFAULT_CAMPAIGN_PACK_CONFIG, context());

  it("expands 3 golds × 4 angles × (JPG + PNG) into 24 stills", () => {
    const stills = plan.jobs.filter((job) => job.kind === "still");
    expect(stills).toHaveLength(12);
    expect(plan.totals.stills).toBe(24);
  });

  it("plans 6 turntables (16:9 + 1:1 per metal) and 3 × 72 spin frames", () => {
    expect(plan.totals.videos).toBe(6);
    expect(plan.totals.spinFrames).toBe(216);
    const turntables = plan.jobs.filter((job) => job.kind === "turntable");
    expect(turntables.map((job) => `${job.width}x${job.height}`)).toEqual([
      "1920x1080", "1080x1080", "1920x1080", "1080x1080", "1920x1080", "1080x1080",
    ]);
    expect(turntables.every((job) => job.kind === "turntable" && job.frameCount === 300)).toBe(true);
  });

  it("names files deterministically under the SKU folder", () => {
    const paths = allPaths(plan.jobs);
    expect(paths).toContain("MS-001/stills/18k-yellow-gold_front.jpg");
    expect(paths).toContain("MS-001/stills/18k-rose-gold_three-quarter.png");
    expect(paths).toContain("MS-001/stills/18k-white-gold_top.jpg");
    expect(paths).toContain("MS-001/video/18k-white-gold_turntable_1920x1080.mp4");
    expect(paths).toContain("MS-001/spin/18k-rose-gold/18k-rose-gold_001.jpg");
    expect(paths).toContain("MS-001/spin/18k-rose-gold/18k-rose-gold_072.jpg");
    expect(plan.zipName).toBe("MS-001_campaign-pack.zip");
    expect(plan.spinViewerPath).toBe("MS-001/spin/spin.html");
    expect(plan.embedPath).toBe("MS-001/embed/embed.html");
    expect(plan.readmePath).toBe("MS-001/README.md");
    expect(plan.manifestPath).toBe("MS-001/manifest.json");
  });

  it("never produces duplicate paths and is stable across runs", () => {
    const paths = allPaths(plan.jobs);
    expect(new Set(paths).size).toBe(paths.length);
    expect(allPaths(planCampaignPack(DEFAULT_CAMPAIGN_PACK_CONFIG, context()).jobs)).toEqual(paths);
  });

  it("groups jobs by metal so each metal is applied once", () => {
    const order = plan.jobs.map((job) => job.metal);
    const switches = order.filter((metal, i) => i === 0 || metal !== order[i - 1]);
    expect(switches).toEqual(["gold-18k-yellow", "gold-18k-white", "gold-18k-rose"]);
  });

  it("counts every output plus README, manifest, spin.html and embed files", () => {
    expect(plan.totals.files).toBe(24 + 6 + 216 + 5);
    expect(plan.totals.estimatedBytes).toBeGreaterThan(0);
  });
});

describe("planCampaignPack — options", () => {
  it("adds the vertical 1080×1920 turntable when requested", () => {
    const config: CampaignPackConfig = {
      ...DEFAULT_CAMPAIGN_PACK_CONFIG,
      turntable: { ...DEFAULT_CAMPAIGN_PACK_CONFIG.turntable, formats: ["landscape", "square", "vertical"] },
    };
    const plan = planCampaignPack(config, context());
    expect(plan.totals.videos).toBe(9);
    expect(allPaths(plan.jobs)).toContain("MS-001/video/18k-yellow-gold_turntable_1080x1920.mp4");
  });

  it("falls back to name, then model id, for the folder", () => {
    expect(packRootName({ modelId: "m-1", sku: null, name: "Halo Ring / 18K" })).toBe("Halo-Ring-18K");
    expect(packRootName({ modelId: "m-1", sku: "  ", name: null })).toBe("m-1");
    expect(sanitizeSegment("Émeraude  ring")).toBe("Emeraude-ring");
  });

  it("includes saved poses after the built-in angles with unique slugs", () => {
    const poses: SavedPoseLike[] = [
      { id: "a", name: "Hero", cameraPosition: [1, 1, 1], target: [0, 0, 0] },
      { id: "b", name: "Hero", cameraPosition: [-1, 1, 1], target: [0, 0, 0] },
      { id: "c", name: "Ignored default", cameraPosition: [0, 3, 0], target: [0, 0, 0], isDefault: true },
    ];
    const config: CampaignPackConfig = {
      ...DEFAULT_CAMPAIGN_PACK_CONFIG,
      metals: ["platinum"],
      angleIds: ["front", poseAngleId("a"), poseAngleId("b"), poseAngleId("c")],
      turntable: { ...DEFAULT_CAMPAIGN_PACK_CONFIG.turntable, enabled: false },
      spin: { ...DEFAULT_CAMPAIGN_PACK_CONFIG.spin, enabled: false },
    };
    const plan = planCampaignPack(config, context({}, poses));
    expect(allPaths(plan.jobs)).toEqual([
      "MS-001/stills/platinum_front.jpg",
      "MS-001/stills/platinum_front.png",
      "MS-001/stills/platinum_pose-hero.jpg",
      "MS-001/stills/platinum_pose-hero.png",
      "MS-001/stills/platinum_pose-hero-2.jpg",
      "MS-001/stills/platinum_pose-hero-2.png",
    ]);
    expect(plan.spinViewerPath).toBeNull();
  });

  it("honours format toggles, sizes and the as-configured look", () => {
    const config: CampaignPackConfig = {
      ...DEFAULT_CAMPAIGN_PACK_CONFIG,
      metals: ["current", "current"],
      stillSize: 4000,
      formats: { jpg: false, png: true },
      turntable: { ...DEFAULT_CAMPAIGN_PACK_CONFIG.turntable, enabled: false },
      spin: { enabled: true, frames: 36, size: 800 },
    };
    const plan = planCampaignPack(config, context());
    expect(metalSlug("current")).toBe("as-configured");
    expect(plan.totals.stills).toBe(4);
    expect(plan.jobs.filter((job) => job.kind === "still").every((job) => job.kind === "still" && job.size === 4000 && job.jpgPath === null)).toBe(true);
    const spin = plan.jobs.find((job) => job.kind === "spin");
    expect(spin?.kind === "spin" && spin.framePaths.at(-1)).toBe("MS-001/spin/as-configured/as-configured_036.jpg");
  });

  it("skips the embed without a SKU and plans nothing without metals", () => {
    expect(planCampaignPack(DEFAULT_CAMPAIGN_PACK_CONFIG, context({ sku: null })).embedPath).toBeNull();
    const empty = planCampaignPack({ ...DEFAULT_CAMPAIGN_PACK_CONFIG, metals: [] }, context());
    expect(empty.jobs).toHaveLength(0);
  });
});

describe("planCampaignPack — ASET cut scope", () => {
  it("adds one top-view ASET image when the piece has traced gems", () => {
    const plan = planCampaignPack(DEFAULT_CAMPAIGN_PACK_CONFIG, { ...context(), hasTracedGems: true });
    const scopes = plan.jobs.filter((job) => job.kind === "scope");
    expect(scopes).toHaveLength(1);
    expect(scopes[0]).toMatchObject({ path: "MS-001/cut-scope/aset_top.png", metal: "gold-18k-yellow", size: 2000 });
    expect(plan.totals.scopes).toBe(1);
    expect(plan.totals.files).toBe(24 + 6 + 216 + 5 + 1);
    // Rides the first metal's group: no extra metal switch.
    const index = plan.jobs.indexOf(scopes[0]!);
    expect(plan.jobs[index - 1]?.metal).toBe("gold-18k-yellow");
  });

  it("is skipped without traced gems or when switched off", () => {
    expect(planCampaignPack(DEFAULT_CAMPAIGN_PACK_CONFIG, context()).totals.scopes).toBe(0);
    const off = planCampaignPack({ ...DEFAULT_CAMPAIGN_PACK_CONFIG, cutScope: false }, { ...context(), hasTracedGems: true });
    expect(off.totals.scopes).toBe(0);
  });
});

describe("relativeTo", () => {
  it("links spin.html to its frames", () => {
    expect(relativeTo("MS-001/spin/spin.html", "MS-001/spin/platinum/platinum_001.jpg")).toBe("platinum/platinum_001.jpg");
    expect(relativeTo("MS-001/embed/embed.html", "MS-001/stills/a.jpg")).toBe("../stills/a.jpg");
  });
});
