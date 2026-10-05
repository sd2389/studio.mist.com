import { afterAll, describe, expect, it, vi } from "vitest";
import { gemShaderQualityReduce, readDeviceCaps, resolveEffectiveQuality } from "@/lib/viewer-quality";

// A small worker host: 2 cores and 2 GB, which the studio's "auto" quality calls Performance.
vi.stubGlobal("navigator", { hardwareConcurrency: 2, deviceMemory: 2, userAgent: "HeadlessChrome" });
const { useViewerQualityStore } = await import("@/stores/viewer-quality-store");
const { pinFullQuality } = await import("./full-quality");

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("pinFullQuality", () => {
  it("draws at High on a device the auto tier would degrade", () => {
    expect(useViewerQualityStore.getState().effective.tier).toBe("performance");

    pinFullQuality();

    const { level, effective } = useViewerQualityStore.getState();
    expect(level).toBe("high");
    expect(effective).toMatchObject({ tier: "high", postfxEnabled: true, aoQuality: "high", aoHalfRes: false });
    // What the stage's materials are made with (JewelryModel): the full gem shader.
    expect(gemShaderQualityReduce(resolveEffectiveQuality(level, readDeviceCaps()).tier)).toBe(false);
  });
});
