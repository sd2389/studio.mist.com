import { describe, it, expect } from "vitest";
import { jobEndpoints, jobHeaders, isValidPayload } from "@/lib/golden/job-mode";

describe("jobEndpoints", () => {
  it("strips trailing slash from apiBase", () => {
    const ep = jobEndpoints("https://api.example.com/", "job-123");
    expect(ep.payload).toBe("https://api.example.com/render-jobs/job-123/payload");
    expect(ep.complete).toBe("https://api.example.com/render-jobs/job-123/complete");
    expect(ep.fail).toBe("https://api.example.com/render-jobs/job-123/fail");
  });

  it("works with apiBase that has no trailing slash", () => {
    const ep = jobEndpoints("https://api.example.com", "job-456");
    expect(ep.payload).toBe("https://api.example.com/render-jobs/job-456/payload");
  });

  it("keeps every URL free of a query string, so no token can reach access logs", () => {
    for (const url of Object.values(jobEndpoints("https://api.example.com", "job-789"))) {
      expect(new URL(url).search).toBe("");
    }
  });
});

describe("jobHeaders", () => {
  it("carries the per-job token in X-Job-Token", () => {
    expect(jobHeaders("tok en+/=&")).toEqual({ "X-Job-Token": "tok en+/=&" });
  });

  it("keeps the other headers it is given", () => {
    expect(jobHeaders("abc", { "Content-Type": "application/json" })).toEqual({
      "Content-Type": "application/json",
      "X-Job-Token": "abc",
    });
  });
});

describe("isValidPayload", () => {
  it("accepts a fully valid payload", () => {
    expect(
      isValidPayload({
        model_url: "https://cdn.example.com/ring.glb",
        lighting: "studio",
        preset: "gold-18k-yellow",
        width: 2048,
        height: 2048,
      }),
    ).toBe(true);
  });

  it("rejects a payload missing the height field", () => {
    expect(
      isValidPayload({
        model_url: "https://cdn.example.com/ring.glb",
        lighting: "studio",
        preset: "gold-18k-yellow",
        width: 2048,
      }),
    ).toBe(false);
  });

  it("rejects a payload with a number instead of string for model_url", () => {
    expect(
      isValidPayload({
        model_url: 42,
        lighting: "studio",
        preset: "gold-18k-yellow",
        width: 2048,
        height: 2048,
      }),
    ).toBe(false);
  });

  it("rejects null", () => {
    expect(isValidPayload(null)).toBe(false);
  });

  it("rejects a non-object primitive", () => {
    expect(isValidPayload("not an object")).toBe(false);
  });
});
