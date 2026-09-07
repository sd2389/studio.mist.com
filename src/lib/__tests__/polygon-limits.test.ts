import { describe, expect, it } from "vitest";
import { FREE_MAX_POLYGONS, formatPolyCount } from "@/lib/upload/polygon-limits";

describe("formatPolyCount", () => {
  it("renders the three plan caps as they appear in pricing copy", () => {
    expect(formatPolyCount(FREE_MAX_POLYGONS)).toBe("100k");
    expect(formatPolyCount(500_000)).toBe("500k");
    expect(formatPolyCount(2_000_000)).toBe("2M");
  });

  it("switches units at the thousand and million boundaries", () => {
    expect(formatPolyCount(999)).toBe("999");
    expect(formatPolyCount(1_000)).toBe("1k");
    expect(formatPolyCount(999_999)).toBe("1000k");
    expect(formatPolyCount(1_000_000)).toBe("1M");
    expect(formatPolyCount(1_500_000)).toBe("1.5M");
  });

  it("keeps the Free cap as the guest default", () => {
    expect(FREE_MAX_POLYGONS).toBe(100_000);
  });
});
