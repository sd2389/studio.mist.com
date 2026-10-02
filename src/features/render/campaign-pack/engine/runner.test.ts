import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAMPAIGN_PACK_CONFIG } from "../domain/defaults";
import { buildPackDocuments } from "../domain/documents";
import { planCampaignPack } from "../domain/plan";
import type { CampaignPackConfig, PackMetalId } from "../domain/types";
import type { PackRenderBackend } from "./pack-backend";
import { runCampaignPack, type PackProgress } from "./runner";

const config: CampaignPackConfig = {
  ...DEFAULT_CAMPAIGN_PACK_CONFIG,
  metals: ["gold-18k-yellow", "gold-18k-rose"],
  angleIds: ["front", "side"],
  turntable: { enabled: true, formats: ["square"], durationSec: 1, fps: 4 },
  spin: { enabled: true, frames: 4, size: 32 },
};
const identity = { modelId: "ring", sku: "R-1", name: "Ring" };

function fakeBackend(overrides: Partial<PackRenderBackend> = {}) {
  const metals: PackMetalId[] = [];
  const backend: PackRenderBackend = {
    notices: [],
    async setMetal(metal) {
      metals.push(metal);
    },
    async renderStill(job) {
      return {
        jpg: job.jpgPath ? new Blob([`jpg:${job.id}`]) : null,
        png: job.pngPath ? new Blob([`png:${job.id}`]) : null,
      };
    },
    async renderSpinFrame(job, index) {
      return new Blob([`spin:${job.id}:${index}`]);
    },
    async renderTurntable(job, onFrame) {
      for (let i = 0; i < job.frameCount; i++) onFrame(i);
      return new Blob([`mp4:${job.id}`]);
    },
    async renderScope(job) {
      return new Blob([`aset:${job.id}`]);
    },
    dispose() {},
    ...overrides,
  };
  return { backend, metals };
}

function run(
  backend: PackRenderBackend,
  extra: { signal?: AbortSignal; onProgress?: (p: PackProgress) => void; hasTracedGems?: boolean } = {},
) {
  const plan = planCampaignPack(config, { identity, savedPoses: [], hasTracedGems: extra.hasTracedGems });
  return {
    plan,
    promise: runCampaignPack({
      plan,
      backend,
      ...extra,
      buildDocuments: (files, failures) =>
        buildPackDocuments({
          plan,
          config,
          identity,
          backgroundLabel: "#FFFFFF",
          origin: "https://studio.example",
          files,
          failures,
          generatedAt: new Date("2026-09-30T00:00:00Z"),
        }),
    }),
  };
}

describe("runCampaignPack", () => {
  it("renders every job into one ZIP and applies each metal once", async () => {
    const { backend, metals } = fakeBackend();
    const progress: number[] = [];
    const { plan, promise } = run(backend, { onProgress: (p) => progress.push(p.fraction) });
    const result = await promise;
    const entries = unzipSync(new Uint8Array(await result.zip.arrayBuffer()));
    expect(metals).toEqual(["gold-18k-yellow", "gold-18k-rose"]);
    expect(result.failures).toEqual([]);
    expect(entries["R-1/stills/18k-rose-gold_side.png"]).toBeDefined();
    expect(strFromU8(entries["R-1/video/18k-yellow-gold_turntable_1080x1080.mp4"]!)).toBe("mp4:turntable:18k-yellow-gold:1080x1080");
    expect(entries["R-1/spin/spin.html"]).toBeDefined();
    expect(result.files).toHaveLength(plan.totals.files);
    expect(result.zipName).toBe("R-1_campaign-pack.zip");
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((value, i) => i === 0 || value >= progress[i - 1]!)).toBe(true);
  });

  it("writes the ASET scope image and explains its legend", async () => {
    const { backend } = fakeBackend();
    const result = await run(backend, { hasTracedGems: true }).promise;
    const entries = unzipSync(new Uint8Array(await result.zip.arrayBuffer()));
    expect(strFromU8(entries["R-1/cut-scope/aset_top.png"]!)).toBe("aset:scope:aset:top");
    expect(strFromU8(entries["R-1/README.md"]!)).toMatch(/ASET scope.*red = bright light/);
  });

  it("reports a failed job and keeps rendering the rest", async () => {
    const { backend } = fakeBackend({
      async renderTurntable(job) {
        if (job.metal === "gold-18k-yellow") throw new Error("encoder unavailable");
        return new Blob(["ok"]);
      },
    });
    const result = await run(backend).promise;
    expect(result.failures).toEqual([
      { jobId: "turntable:18k-yellow-gold:1080x1080", label: "18K Yellow Gold · Turntable 1080×1080", message: "encoder unavailable" },
    ]);
    const entries = unzipSync(new Uint8Array(await result.zip.arrayBuffer()));
    expect(entries["R-1/video/18k-yellow-gold_turntable_1080x1080.mp4"]).toBeUndefined();
    expect(entries["R-1/video/18k-rose-gold_turntable_1080x1080.mp4"]).toBeDefined();
    expect(strFromU8(entries["R-1/README.md"]!)).toContain("encoder unavailable");
  });

  it("never ships half a spin", async () => {
    const { backend } = fakeBackend({
      async renderSpinFrame(job, index) {
        if (index === 2) throw new Error("GPU lost");
        return new Blob([`${job.id}:${index}`]);
      },
    });
    const result = await run(backend).promise;
    expect(result.files.some((file) => file.kind === "spin-frame")).toBe(false);
    const entries = unzipSync(new Uint8Array(await result.zip.arrayBuffer()));
    expect(entries["R-1/spin/spin.html"]).toBeUndefined();
    expect(result.failures).toHaveLength(2);
  });

  it("stops with an AbortError when cancelled", async () => {
    const controller = new AbortController();
    const { backend } = fakeBackend({
      async renderStill(job) {
        controller.abort();
        return { jpg: new Blob([job.id]), png: null };
      },
    });
    await expect(run(backend, { signal: controller.signal }).promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("retries the metal on the next job when applying it failed", async () => {
    let calls = 0;
    const { backend } = fakeBackend({
      async setMetal() {
        calls += 1;
        if (calls === 1) throw new Error("material compile failed");
      },
    });
    const result = await run(backend).promise;
    expect(result.failures[0]?.message).toBe("material compile failed");
    expect(result.files.some((file) => file.metal === "18k-yellow-gold")).toBe(true);
  });
});
