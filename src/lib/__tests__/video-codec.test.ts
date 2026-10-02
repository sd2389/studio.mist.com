import { describe, expect, it } from "vitest";
import {
  avcCodecCandidates,
  avcCodecString,
  defaultVideoBitrate,
  resolveH264EncoderConfig,
  selectAvcLevel,
} from "@/lib/video-codec";

const codecFor = (width: number, height: number, fps = 30, bitrate?: number) => {
  const level = selectAvcLevel({ width, height, fps, bitrate });
  return level ? avcCodecString(level) : null;
};

describe("selectAvcLevel", () => {
  it("keeps High@4.0 (avc1.640028) up to 1080p30", () => {
    expect(codecFor(1920, 1080)).toBe("avc1.640028");
    expect(codecFor(1080, 1920)).toBe("avc1.640028");
  });

  it("uses smaller levels for smaller frames", () => {
    expect(codecFor(1280, 720)).toBe("avc1.64001f");
    expect(codecFor(1080, 1080)).toBe("avc1.640020");
    expect(codecFor(640, 360)).toBe("avc1.64001e");
  });

  it("raises the level for frame rate, not just size", () => {
    expect(codecFor(1920, 1080, 60)).toBe("avc1.64002a");
    expect(codecFor(3840, 2160, 60)).toBe("avc1.640034");
  });

  it("selects 5.1 for 4K and 6.0 for 8K", () => {
    expect(codecFor(3840, 2160)).toBe("avc1.640033");
    expect(codecFor(7680, 4320)).toBe("avc1.64003c");
  });

  it("accounts for bitrate (High profile 1.25× headroom)", () => {
    expect(codecFor(1920, 1080, 30, 25_000_000)).toBe("avc1.640028");
    expect(codecFor(1920, 1080, 30, 26_000_000)).toBe("avc1.640029");
  });

  it("returns null beyond level 6.2", () => {
    expect(selectAvcLevel({ width: 16384, height: 16384, fps: 30 })).toBeNull();
  });

  it("lists higher levels as fallbacks, minimal level first", () => {
    const candidates = avcCodecCandidates({ width: 3840, height: 2160, fps: 30 });
    expect(candidates[0]).toBe("avc1.640033");
    expect(candidates).toContain("avc1.64003c");
    expect(candidates).not.toContain("avc1.640028");
  });
});

describe("resolveH264EncoderConfig", () => {
  const spec = { width: 3840, height: 2160, fps: 30, bitrate: defaultVideoBitrate(3840, 2160, 30) };

  it("returns the first configuration the encoder accepts", async () => {
    const seen: string[] = [];
    const result = await resolveH264EncoderConfig(spec, async (config) => {
      seen.push(`${config.codec}/${config.hardwareAcceleration}`);
      return { supported: config.codec === "avc1.640034" && config.hardwareAcceleration === "prefer-software" };
    });
    expect(result).toMatchObject({ ok: true, codec: "avc1.640034" });
    expect(seen[0]).toBe("avc1.640033/no-preference");
  });

  it("explains why MP4 is unavailable instead of failing silently", async () => {
    const result = await resolveH264EncoderConfig(spec, async () => ({ supported: false }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/3840×2160/);
    const odd = await resolveH264EncoderConfig({ ...spec, width: 1081 }, async () => ({ supported: true }));
    expect(odd.ok).toBe(false);
  });

  it("treats a throwing probe as unsupported", async () => {
    const result = await resolveH264EncoderConfig(spec, async () => {
      throw new Error("boom");
    });
    expect(result.ok).toBe(false);
  });
});
