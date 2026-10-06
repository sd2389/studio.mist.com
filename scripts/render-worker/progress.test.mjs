import { describe, expect, it } from "vitest";
import { jobProgress, UPLOADING_AT } from "./progress.mjs";

/** Every heartbeat a job of `kind` sends along `steps`, as `[progress, stage]`. */
const along = (kind, steps) => steps.map((done) => Object.values(jobProgress(kind, done)));

describe("jobProgress", () => {
  it("fills a still's bar with the images the page renders, then uploads", () => {
    expect(along("still", [
      { stage: "loading" },
      { stage: "rendering", rendered: 0 },
      { stage: "rendering", rendered: 1 },
      { stage: "uploading", rendered: 1 },
    ])).toEqual([[0, "loading"], [0, "rendering"], [0.95, "rendering"], [0.95, "uploading"]]);
    expect(jobProgress("angle_set", { stage: "rendering", rendered: 0.5 })).toEqual({ progress: 0.475, stage: "rendering" });
  });

  // ffmpeg takes each frame as it comes, so encoding runs a little behind rendering.
  it("fills a turntable's bar with the frames rendered and the frames encoded together", () => {
    expect(along("turntable", [
      { stage: "rendering", rendered: 0.5, encoded: 0 },
      { stage: "rendering", rendered: 1, encoded: 0.6 },
      { stage: "encoding", rendered: 1, encoded: 0.6 },
      { stage: "encoding", rendered: 1, encoded: 1 },
      { stage: "uploading", rendered: 1, encoded: 1 },
    ])).toEqual([[0.238, "rendering"], [0.76, "rendering"], [0.76, "encoding"], [0.95, "encoding"], [0.95, "uploading"]]);
  });

  it("gives a spin's ZIP, written in seconds once the frames are in, a sliver of the bar", () => {
    expect(along("spin", [
      { stage: "rendering", rendered: 1, encoded: 0 },
      { stage: "encoding", rendered: 1, encoded: 0.5 },
      { stage: "encoding", rendered: 1, encoded: 1 },
    ])).toEqual([[0.9, "rendering"], [0.925, "encoding"], [0.95, "encoding"]]);
  });

  // The page measures the whole pack, its turntables' MP4s finished as it goes; the ZIP comes after.
  it("fills a Campaign Pack's bar with the page's own measure of it, then its ZIP", () => {
    expect(along("campaign_pack", [
      { stage: "rendering", rendered: 0.5 },
      { stage: "rendering", rendered: 1, encoded: 0 },
      { stage: "encoding", rendered: 1, encoded: 0.5 },
      { stage: "uploading", rendered: 1, encoded: 1 },
    ])).toEqual([[0.45, "rendering"], [0.9, "rendering"], [0.925, "encoding"], [0.95, "uploading"]]);
  });

  it("never goes back, from loading to uploading, for any kind", () => {
    for (const kind of ["still", "angle_set", "turntable", "spin", "campaign_pack"]) {
      const steps = [{ stage: "loading" }];
      for (let rendered = 0; rendered <= 1; rendered += 0.25) steps.push({ stage: "rendering", rendered, encoded: rendered * 0.8 });
      for (let encoded = 0.8; encoded <= 1; encoded += 0.1) steps.push({ stage: "encoding", rendered: 1, encoded });
      steps.push({ stage: "uploading", rendered: 1, encoded: 1 });
      const bar = steps.map((done) => jobProgress(kind, done).progress);
      expect(bar.every((progress, index) => index === 0 || progress >= bar[index - 1])).toBe(true);
      expect(bar.at(-1)).toBe(UPLOADING_AT);
    }
  });

  it("keeps to 0 to 1, whatever it is told", () => {
    expect(jobProgress("turntable", { stage: "rendering", rendered: 3, encoded: -1 }).progress).toBe(0.475);
    expect(jobProgress("spin", { stage: "rendering", rendered: Number.NaN }).progress).toBe(0);
  });
});
