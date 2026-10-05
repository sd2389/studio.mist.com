import { describe, expect, it } from "vitest";
import { assetPrefix, DEFAULT_ASSET_PREFIXES, pagePolicy, routeFor, withoutQuery } from "./network.mjs";

const HARNESS = "http://127.0.0.1:3000";
const SINK = "http://127.0.0.1:41234";
const SIGNED_BACKGROUND = "https://bucket.r2.example.com/customers/4/assets/bg.png?X-Amz-Signature=abc&X-Amz-Expires=900";

const policy = pagePolicy({
  harnessOrigin: HARNESS,
  sinkOrigin: SINK,
  jobId: 12,
  inputUrls: [SIGNED_BACKGROUND],
  assetPrefixes: [...DEFAULT_ASSET_PREFIXES, assetPrefix("https://assets.example.com")],
});

describe("routeFor", () => {
  it("lets the page reach its harness and its sink", () => {
    expect(routeFor(`${HARNESS}/render-harness?mode=export`, "GET", policy)).toBe("continue");
    expect(routeFor(`${HARNESS}/_next/static/chunks/app.js`, "GET", policy)).toBe("continue");
    expect(routeFor(`${HARNESS}/api/catalog/source`, "GET", policy)).toBe("continue");
    expect(routeFor(`${SINK}/files/ring.png`, "POST", policy)).toBe("continue");
    expect(routeFor("data:image/png;base64,AAAA", "GET", policy)).toBe("continue");
  });

  it("fetches the job's own token routes for the page, and no other job's", () => {
    expect(routeFor(`${HARNESS}/render-jobs/12/inputs/background`, "GET", policy)).toBe("job-input");
    expect(routeFor(`${HARNESS}/render-jobs/13/inputs/background`, "GET", policy)).toBe("abort");
    expect(routeFor(`${HARNESS}/render-jobs/12/payload`, "GET", policy)).toBe("abort");
    expect(routeFor(`${HARNESS}/render-jobs/12/inputs/background?token=x`, "GET", policy)).toBe("abort");
    expect(routeFor(`${HARNESS}/render-jobs/12/inputs/background`, "POST", policy)).toBe("abort");
    expect(routeFor(`${HARNESS}/render-jobs/12/inputs/background`, "GET", pagePolicy({ harnessOrigin: HARNESS }))).toBe("abort");
  });

  it("fetches the job's signed inputs for the page, exactly those", () => {
    expect(routeFor(SIGNED_BACKGROUND, "GET", policy)).toBe("input");
    expect(routeFor(SIGNED_BACKGROUND.replace("abc", "abd"), "GET", policy)).toBe("abort");
    expect(routeFor("https://bucket.r2.example.com/customers/5/models/other.glb", "GET", policy)).toBe("abort");
  });

  it("serves allowlisted assets from the cache", () => {
    expect(routeFor("https://www.gstatic.com/draco/versioned/decoders/1.5.5/draco_decoder.wasm", "GET", policy)).toBe("asset");
    expect(routeFor("https://assets.example.com/hdri/studio.hdr", "GET", policy)).toBe("asset");
    expect(routeFor("https://www.gstatic.com/other/thing.js", "GET", policy)).toBe("abort");
    expect(routeFor("https://assets.example.com.evil.test/hdri/studio.hdr", "GET", policy)).toBe("abort");
    expect(routeFor("https://assets.example.com/upload", "POST", policy)).toBe("abort");
  });

  it("aborts everything else, loopback included", () => {
    for (const url of [
      "https://example.com/",
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:8765/render-jobs/claim",
      "http://localhost:3000/render-harness",
      "ws://127.0.0.1:9222/devtools",
      "not a url",
    ]) {
      expect(routeFor(url, "GET", policy), url).toBe("abort");
    }
  });
});

describe("assetPrefix", () => {
  it("makes an origin a prefix of its whole host and keeps a path prefix as it is", () => {
    expect(assetPrefix("https://assets.example.com")).toBe("https://assets.example.com/");
    expect(assetPrefix(" https://cdn.example.com/catalog/ ")).toBe("https://cdn.example.com/catalog/");
    expect(() => assetPrefix("ftp://files.example.com")).toThrow(/not an http/);
  });
});

it("keeps signatures out of the log", () => {
  expect(withoutQuery(SIGNED_BACKGROUND)).toBe("https://bucket.r2.example.com/customers/4/assets/bg.png");
});
