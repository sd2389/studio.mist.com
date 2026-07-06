import { describe, expect, it } from "vitest";
import {
  applyQualityToPostFX,
  detectDeviceTier,
  normalizeQualityLevel,
  resolveEffectiveQuality,
} from "@/lib/viewer-quality";
import { DEFAULT_VIEWER_POSTFX } from "@/lib/viewer-postfx-config";

describe("detectDeviceTier", () => {
  it("strong desktop → high", () => {
    expect(detectDeviceTier({ hardwareConcurrency: 12, deviceMemoryGb: 16, isMobile: false })).toBe("high");
  });
  it("mid desktop → balanced", () => {
    expect(detectDeviceTier({ hardwareConcurrency: 4, deviceMemoryGb: 8, isMobile: false })).toBe("balanced");
  });
  it("weak machine → performance", () => {
    expect(detectDeviceTier({ hardwareConcurrency: 2, deviceMemoryGb: 2, isMobile: false })).toBe("performance");
  });
  it("modern phone → balanced", () => {
    expect(detectDeviceTier({ hardwareConcurrency: 8, deviceMemoryGb: 6, isMobile: true })).toBe("balanced");
  });
  it("low-memory phone → performance", () => {
    expect(detectDeviceTier({ hardwareConcurrency: 4, deviceMemoryGb: 2, isMobile: true })).toBe("performance");
  });
  it("unknown caps → balanced (safe middle)", () => {
    expect(detectDeviceTier({ isMobile: false })).toBe("balanced");
  });
});

describe("resolveEffectiveQuality", () => {
  const weak = { hardwareConcurrency: 2, deviceMemoryGb: 2, isMobile: false };
  it("explicit level overrides device detection", () => {
    expect(resolveEffectiveQuality("high", weak).tier).toBe("high");
  });
  it("auto follows device detection", () => {
    expect(resolveEffectiveQuality("auto", weak).tier).toBe("performance");
  });
  it("high tier: full dpr + full effects", () => {
    const q = resolveEffectiveQuality("high", weak);
    expect(q).toEqual({ tier: "high", dprCap: 2, postfxEnabled: true, aoQuality: "high", aoHalfRes: false });
  });
  it("performance tier: dpr 1, postfx off", () => {
    const q = resolveEffectiveQuality("performance", weak);
    expect(q).toEqual({ tier: "performance", dprCap: 1, postfxEnabled: false, aoQuality: "performance", aoHalfRes: true });
  });
});

describe("normalizeQualityLevel", () => {
  it("passes through valid levels unchanged", () => {
    expect(normalizeQualityLevel("auto")).toBe("auto");
    expect(normalizeQualityLevel("high")).toBe("high");
    expect(normalizeQualityLevel("balanced")).toBe("balanced");
    expect(normalizeQualityLevel("performance")).toBe("performance");
  });
  it("falls back to auto for corrupt/unknown string", () => {
    expect(normalizeQualityLevel("ultra")).toBe("auto");
    expect(normalizeQualityLevel("")).toBe("auto");
  });
  it("falls back to auto for non-string types", () => {
    expect(normalizeQualityLevel(null)).toBe("auto");
    expect(normalizeQualityLevel(undefined)).toBe("auto");
    expect(normalizeQualityLevel(42)).toBe("auto");
    expect(normalizeQualityLevel({ level: "high" })).toBe("auto");
  });
});

describe("applyQualityToPostFX", () => {
  it("high tier leaves config untouched (export-parity identity)", () => {
    const q = resolveEffectiveQuality("high", { isMobile: false });
    expect(applyQualityToPostFX(DEFAULT_VIEWER_POSTFX, q)).toEqual(DEFAULT_VIEWER_POSTFX);
  });
  it("balanced tier downgrades AO but keeps effects on", () => {
    const q = resolveEffectiveQuality("balanced", { isMobile: false });
    const out = applyQualityToPostFX(DEFAULT_VIEWER_POSTFX, q);
    expect(out.aoEnabled).toBe(DEFAULT_VIEWER_POSTFX.aoEnabled);
    expect(out.ao.quality).toBe("medium");
    expect(out.ao.halfRes).toBe(true);
  });
  it("performance tier disables AO entirely", () => {
    const q = resolveEffectiveQuality("performance", { isMobile: false });
    expect(applyQualityToPostFX(DEFAULT_VIEWER_POSTFX, q).aoEnabled).toBe(false);
  });
});
