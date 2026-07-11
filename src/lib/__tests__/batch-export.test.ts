import { describe, expect, it } from "vitest";
import { estimateBatchJobCount } from "@/lib/variants/batch-export";

describe("estimateBatchJobCount", () => {
  it("expands 2 variants × (current + 1 extra scene) to 4", () => {
    expect(
      estimateBatchJobCount({
        selectedVariantCount: 2,
        variantsStateItemCount: 5,
        extraSelectedSceneCount: 1,
      }),
    ).toBe(4);
  });

  it("uses one live job when no variants selected and state empty", () => {
    expect(
      estimateBatchJobCount({
        selectedVariantCount: 0,
        variantsStateItemCount: 0,
        extraSelectedSceneCount: 0,
      }),
    ).toBe(1);
  });
});
