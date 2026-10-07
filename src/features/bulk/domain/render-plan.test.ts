import { afterEach, describe, expect, it, vi } from "vitest";
import { quoteRenderPlan } from "@/lib/api/ingest";
import { batchCreateBody } from "./batch-request";
import { DEFAULT_RENDER_PLAN, rendersSomething, renderPlanSummary, withStillAngles } from "./render-plan";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the default render plan", () => {
  it("is the ADR's: four 2000 px stills and a 6 s turntable, the front still the thumbnail, nothing public", () => {
    expect(DEFAULT_RENDER_PLAN).toEqual({
      stills: { angles: ["front", "three-quarter", "side", "top"], size: 2000, format: "jpeg" },
      turntable: { width: 1080, height: 1080, fps: 30, seconds: 6, quality: "high" },
      spin: null,
      publish_media: false,
      thumbnail_from: "front",
    });
    expect(renderPlanSummary(DEFAULT_RENDER_PLAN)).toBe("4 stills at 2000 px · 6 s turntable, 1080×1080 · outputs private");
  });
});

describe("withStillAngles", () => {
  it("keeps the pack's order, and takes the thumbnail from the front still or else the first one", () => {
    const sideAndTop = withStillAngles(DEFAULT_RENDER_PLAN, ["top", "side"]);

    expect(sideAndTop.stills?.angles).toEqual(["side", "top"]);
    expect(sideAndTop.stills?.size).toBe(2000);
    expect(sideAndTop.thumbnail_from).toBe("side");
    expect(withStillAngles(sideAndTop, ["top", "front", "side"]).thumbnail_from).toBe("front");
  });

  it("renders no stills, and takes no thumbnail, once every angle is left out", () => {
    const none = withStillAngles(DEFAULT_RENDER_PLAN, []);

    expect([none.stills, none.thumbnail_from]).toEqual([null, null]);
    expect(rendersSomething(none)).toBe(true); // the turntable is still on
    expect(rendersSomething({ ...none, turntable: null })).toBe(false);
  });
});

describe("the plan in the batch request and its price", () => {
  it("goes in the create request as it was picked, and is left out when nothing renders", () => {
    const options = { name: "Autumn rings", manifest: null, defaultCategory: "Ring" };

    expect(batchCreateBody([], { ...options, renderPlan: DEFAULT_RENDER_PLAN }).render_plan).toEqual(DEFAULT_RENDER_PLAN);
    expect("render_plan" in batchCreateBody([], options)).toBe(false);
  });

  it("is priced by the API through the ingest proxy", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({ render_credits: 7, jobs: [{ kind: "angle_set", credits: 4, files: 4 }, { kind: "turntable", credits: 3, files: 1 }] }),
    );

    const quote = await quoteRenderPlan(DEFAULT_RENDER_PLAN);

    expect(quote.render_credits).toBe(7);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("/api/ingest/render-plan/quote");
    expect(JSON.parse(String(init?.body))).toEqual({ render_plan: DEFAULT_RENDER_PLAN });
  });
});
