import { describe, expect, it } from "vitest";
import { readConfig } from "./config.mjs";

const BASE = { RENDER_API_URL: "http://backend:8765", RENDER_WORKER_TOKEN: "t", HARNESS_BASE_URL: "http://127.0.0.1:3000" };

describe("readConfig", () => {
  it("defaults to the GPU of the platform, one slot, every kind the harness renders, and ffmpeg on the PATH", () => {
    expect(readConfig(BASE, "linux")).toMatchObject({
      profileName: "nvidia",
      slots: 1,
      kinds: ["still", "angle_set", "turntable", "spin", "campaign_pack"],
      sandbox: true,
      harnessUrl: "http://127.0.0.1:3000",
      ffmpegPath: "ffmpeg",
    });
    expect(readConfig(BASE, "darwin").profileName).toBe("metal");
    expect(readConfig({ ...BASE, WORKER_FFMPEG: "/opt/ffmpeg/bin/ffmpeg" }).ffmpegPath).toBe("/opt/ffmpeg/bin/ffmpeg");
  });

  it("claims the kinds it is given, each once, and at least one", () => {
    expect(readConfig({ ...BASE, WORKER_KINDS: "turntable, spin,turntable" }).kinds).toEqual(["turntable", "spin"]);
    expect(readConfig({ ...BASE, WORKER_KINDS: "" }).kinds).toEqual(["still", "angle_set", "turntable", "spin", "campaign_pack"]);
    expect(readConfig({ ...BASE, WORKER_KINDS: "campaign_pack" }).kinds).toEqual(["campaign_pack"]);
    expect(() => readConfig({ ...BASE, WORKER_KINDS: " , " })).toThrow(/WORKER_KINDS names no kind/);
  });

  it("sends the first token of a rotation list", () => {
    expect(readConfig({ ...BASE, RENDER_WORKER_TOKEN: " new-token , old-token" }, "linux").workerToken).toBe("new-token");
    expect(() => readConfig({ ...BASE, RENDER_WORKER_TOKEN: " , " }, "linux")).toThrow(/RENDER_WORKER_TOKEN has no token/);
  });

  it("lists every problem at once", () => {
    expect(() => readConfig({ WORKER_GPU: "amd", WORKER_KINDS: "still,thumbnail", WORKER_SLOTS: "0" }, "linux")).toThrow(
      /RENDER_API_URL is not set; RENDER_WORKER_TOKEN is not set; WORKER_GPU must be one of nvidia, metal, swiftshader; WORKER_KINDS: this worker does still, angle_set, turntable, spin, campaign_pack, convert, batch_archive, not thumbnail; set HARNESS_BASE_URL .* or WORKER_APP_DIR .*; WORKER_SLOTS must be/,
    );
  });

  it("converts only when told to, from the vendored converter files", () => {
    expect(readConfig(BASE).kinds).not.toContain("convert");
    expect(readConfig({ ...BASE, WORKER_KINDS: "convert" }).kinds).toEqual(["convert"]);
    expect(readConfig(BASE).kinds).not.toContain("batch_archive");
    expect(readConfig({ ...BASE, WORKER_KINDS: "convert,batch_archive" }).kinds).toEqual(["convert", "batch_archive"]);
    expect(readConfig({ ...BASE, WORKER_CACHE_DIR: "/var/cache/w" }).vendorDir).toBe("/var/cache/w/vendor");
    expect(readConfig({ ...BASE, WORKER_VENDOR_DIR: "/app/vendor" }).vendorDir).toBe("/app/vendor");
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
    expect(assetPrefixes.map(({ prefix }) => prefix)).toEqual(["https://www.gstatic.com/draco/", "https://assets.example.com/", "https://cdn.example.com/catalog/"]);
  });
});
