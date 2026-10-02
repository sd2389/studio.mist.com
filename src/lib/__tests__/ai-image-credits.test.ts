import { describe, expect, it } from "vitest";
import { formatAiCredits } from "@/lib/ai-image-credits";

describe("formatAiCredits", () => {
  it("shows what is left of the plan's allotment", () => {
    expect(formatAiCredits(12, 25)).toBe("12 / 25");
    expect(formatAiCredits(0, 25)).toBe("0 / 25");
  });

  it("never shows a negative balance", () => {
    expect(formatAiCredits(-1, 25)).toBe("0 / 25");
  });

  it("shows a balance above the allotment on its own", () => {
    expect(formatAiCredits(150, 25)).toBe("150");
  });
});
