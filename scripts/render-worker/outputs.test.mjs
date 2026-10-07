import { statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAMPAIGN_PACK_CONFIG, TURNTABLE_FORMATS } from "../../src/features/render/campaign-pack/domain/defaults";
import { planCampaignPack } from "../../src/features/render/campaign-pack/domain/plan";
import { SPIN_VIEWER_NAME, spinFrameNames } from "../../src/features/render/harness/spin-files";
import { PACK_VIDEO_SIZES, packEntryLimit, spinFileNames, ZIP_END_BYTES, zipEntryBytes } from "./outputs.mjs";
import { isEntryPath } from "./sink.mjs";
import { writeZip } from "./zip.mjs";

describe("spinFileNames", () => {
  // The sink takes only these names, so they must be the ones the harness posts.
  it("names a spin's files as its page posts them: the frames in turning order, then the viewer", () => {
    for (const spec of [{ frames: 72, format: "jpeg" }, { frames: 3, format: "png" }, { frames: 144, format: "jpeg" }, { frames: 1000, format: "png" }]) {
      expect(spinFileNames(spec)).toEqual([...spinFrameNames(spec), SPIN_VIEWER_NAME]);
    }
    expect(spinFileNames({ frames: 2, format: "jpeg" })).toEqual(["frame_001.jpg", "frame_002.jpg", "spin.html"]);
  });
});

/** Every file a pack's plan names, its documents included: its ZIP's entries. */
function planPaths(plan) {
  const outputs = plan.jobs.flatMap((job) => {
    if (job.kind === "still") return [job.jpgPath, job.pngPath].filter(Boolean);
    if (job.kind === "spin") return job.framePaths;
    return [job.path];
  });
  return [...outputs, plan.spinViewerPath, plan.embedPath, plan.embedSnippetPath, plan.readmePath, plan.manifestPath].filter(Boolean);
}

describe("a Campaign Pack's entries, as the studio's planner names them", () => {
  const identity = { modelId: "solitaire.glb", sku: "RING-1", name: "Solitaire ring" };
  const savedPoses = [{ id: "pose-hero", name: "Hero shot", cameraPosition: [1, 1, 1], target: [0, 0, 0] }];

  it("are paths the sink takes, every one of them", () => {
    const config = { ...DEFAULT_CAMPAIGN_PACK_CONFIG, angleIds: [...DEFAULT_CAMPAIGN_PACK_CONFIG.angleIds, "pose:pose-hero"] };
    for (const who of [identity, { modelId: "ring.glb", sku: null, name: "Bague à l’étoile №5" }, { modelId: "ring.glb", sku: null, name: null }]) {
      const paths = planPaths(planCampaignPack(config, { identity: who, savedPoses, hasTracedGems: true }));
      expect(paths.filter((entry) => !isEntryPath(entry))).toEqual([]);
    }
  });

  it("are no more than the sink is told to take: 252 for the default pack", () => {
    const plan = planCampaignPack(DEFAULT_CAMPAIGN_PACK_CONFIG, { identity, savedPoses: [], hasTracedGems: true });
    expect(planPaths(plan)).toHaveLength(252);
    expect(packEntryLimit(DEFAULT_CAMPAIGN_PACK_CONFIG)).toBe(252);
  });

  it("have turntables only at the pack's own sizes", () => {
    expect(PACK_VIDEO_SIZES).toEqual(Object.fromEntries(Object.entries(TURNTABLE_FORMATS).map(([format, { width, height }]) => [format, [width, height]])));
  });
});

describe("zipEntryBytes", () => {
  // What the worker counts against a pack's cap as its files come in, before it writes the ZIP.
  it("is what each entry adds to the ZIP writeZip makes, to the byte", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "outputs-test-"));
    try {
      const entries = [["RING-1/stills/18k-yellow-gold_front.jpg", 5000, false], ["RING-1/video/18k-yellow-gold_turntable_1920x1080.mp4", 12_345, false], ["RING-1/spin/spin.html", 0, false]].map(
        ([name, bytes, compress], index) => {
          const file = path.join(dir, `entry-${index}`);
          writeFileSync(file, Buffer.alloc(bytes, index));
          return { name, path: file, compress, bytes };
        },
      );
      const zipPath = path.join(dir, "pack.zip");
      const { bytes } = await writeZip(entries, zipPath, { maxBytes: 4 * 1024 ** 3 - 1 });
      expect(bytes).toBe(statSync(zipPath).size);
      expect(bytes).toBe(ZIP_END_BYTES + entries.reduce((sum, entry) => sum + zipEntryBytes(entry.name, entry.bytes), 0));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
