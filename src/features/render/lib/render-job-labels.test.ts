import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobAge, jobSummary, jobTitle } from "./render-job-labels";

type LabelledJob = Parameters<typeof jobTitle>[0];

function job(spec: Record<string, unknown>, kind = "angle_set"): LabelledJob {
  return { id: 4813, kind, status: "queued", stage: null, cancel_requested_at: null, spec, watermark: false };
}

describe("render job labels", () => {
  it("name a job by the files its spec's output_names list", () => {
    const set = job({ width: 2000, height: 2000, format: "jpeg", frames: 2, output_names: ["ring-front.jpg", "ring-side.jpg"] });

    expect(jobTitle(set)).toBe("ring-front.jpg + 1 more");
    expect(jobSummary(set)).toBe("Angle set · 2 files · 2000 × 2000 · JPEG");
  });

  it("still read outputs from an API older than A2, or rolled back past it", () => {
    const old = job({ width: 3840, height: 2160, format: "png", frames: 1, outputs: ["solitaire-4K.png"] }, "still");

    expect(jobTitle(old)).toBe("solitaire-4K.png");
    expect(jobSummary(old)).toBe("Still · 3840 × 2160 · PNG");
  });

  it("fall back to the kind for a job that names no file", () => {
    expect(jobTitle(job({ width: 512, height: 512 }, "still"))).toBe("Still #4813");
  });
});

describe("jobAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T16:02:11Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("reads the API's Z times as UTC, as it read the times that had no zone", () => {
    expect(jobAge({ created_at: "2026-10-03T14:02:11Z" })).toBe("2 hours ago");
    expect(jobAge({ created_at: "2026-10-03T14:02:11.482913Z" })).toBe("2 hours ago");
    expect(jobAge({ created_at: "2026-10-03T14:02:11" })).toBe("2 hours ago");
  });
});
