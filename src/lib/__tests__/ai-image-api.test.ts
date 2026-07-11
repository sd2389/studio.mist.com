import { describe, expect, it } from "vitest";
import { aiImageStatusLabel } from "@/lib/ai-image-api";

describe("aiImageStatusLabel", () => {
  it("labels stub pipeline modes", () => {
    expect(aiImageStatusLabel("shoot:stub")).toBe("Stub result (dev mode) — not production AI");
    expect(aiImageStatusLabel("model:stub")).toBe("Stub result (dev mode) — not production AI");
    expect(aiImageStatusLabel("stub")).toBe("Stub result (dev mode) — not production AI");
  });

  it("labels non-stub success", () => {
    expect(aiImageStatusLabel("shoot:sdxl")).toBe("AI image ready");
    expect(aiImageStatusLabel("model:live")).toBe("AI image ready");
  });

  it("treats missing mode as ready (non-stub)", () => {
    expect(aiImageStatusLabel(null)).toBe("AI image ready");
    expect(aiImageStatusLabel(undefined)).toBe("AI image ready");
    expect(aiImageStatusLabel("")).toBe("AI image ready");
  });
});
