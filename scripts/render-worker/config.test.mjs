import { describe, expect, it } from "vitest";
import { readConfig } from "./config.mjs";

const BASE = { RENDER_API_URL: "http://backend:8765", RENDER_WORKER_TOKEN: "t", HARNESS_BASE_URL: "http://127.0.0.1:3000" };

describe("readConfig", () => {
  it("defaults to the GPU of the platform, one slot, stills and angle sets", () => {
    expect(readConfig(BASE, "linux")).toMatchObject({ profileName: "nvidia", slots: 1, kinds: ["still", "angle_set"], sandbox: true, harnessUrl: "http://127.0.0.1:3000" });
    expect(readConfig(BASE, "darwin").profileName).toBe("metal");
  });

  it("lists every problem at once", () => {
    expect(() => readConfig({ WORKER_GPU: "amd", WORKER_KINDS: "still,turntable", WORKER_SLOTS: "0" }, "linux")).toThrow(
      /RENDER_API_URL is not set; RENDER_WORKER_TOKEN is not set; WORKER_GPU must be one of nvidia, metal, swiftshader; WORKER_KINDS: .*not turntable; set HARNESS_BASE_URL .* or WORKER_APP_DIR .*; WORKER_SLOTS must be/,
    );
  });

  it("serves the harness from loopback only, where WebGPU has a secure context", () => {
    expect(() => readConfig({ ...BASE, HARNESS_BASE_URL: "http://10.0.0.5:3000" })).toThrow(/loopback/);
    expect(() => readConfig({ ...BASE, HARNESS_BASE_URL: "https://studio.example.com" })).toThrow(/loopback/);
    expect(readConfig({ ...BASE, HARNESS_BASE_URL: undefined, WORKER_APP_DIR: "/app" })).toMatchObject({ harnessUrl: null, appDir: "/app", harnessPort: 3000 });
  });

  it("refuses SwiftShader where a GPU is required", () => {
    expect(() => readConfig({ ...BASE, WORKER_GPU: "swiftshader", WORKER_REQUIRE_GPU: "1" })).toThrow(/refuses the swiftshader profile/);
    expect(readConfig({ ...BASE, WORKER_GPU: "swiftshader" }).profileName).toBe("swiftshader");
  });

  it("adds the asset origins to the allowlist", () => {
    const { assetPrefixes } = readConfig({ ...BASE, WORKER_ASSET_ORIGINS: "https://assets.example.com, https://cdn.example.com/catalog/" });
    expect(assetPrefixes).toEqual(["https://www.gstatic.com/draco/", "https://assets.example.com/", "https://cdn.example.com/catalog/"]);
  });
});
