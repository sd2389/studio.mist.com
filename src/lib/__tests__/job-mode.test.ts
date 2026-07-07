import { describe, it, expect } from "vitest";
import { jobEndpoints, isValidPayload } from "@/lib/golden/job-mode";

describe("jobEndpoints", () => {
  it("strips trailing slash from apiBase", () => {
    const ep = jobEndpoints("https://api.example.com/", "job-123", "abc");
    expect(ep.payload).toBe("https://api.example.com/render-jobs/job-123/payload?token=abc");
    expect(ep.complete).toBe("https://api.example.com/render-jobs/job-123/complete?token=abc");
    expect(ep.fail).toBe("https://api.example.com/render-jobs/job-123/fail?token=abc");
  });

  it("works with apiBase that has no trailing slash", () => {
    const ep = jobEndpoints("https://api.example.com", "job-456", "tok");
    expect(ep.payload).toBe("https://api.example.com/render-jobs/job-456/payload?token=tok");
  });

  it("URL-encodes token with special characters", () => {
    const ep = jobEndpoints("https://api.example.com", "job-789", "tok en+/=&");
    expect(ep.payload).toContain("?token=tok%20en%2B%2F%3D%26");
    expect(ep.complete).toContain("?token=tok%20en%2B%2F%3D%26");
    expect(ep.fail).toContain("?token=tok%20en%2B%2F%3D%26");
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
