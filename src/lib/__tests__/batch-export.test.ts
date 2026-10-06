import { describe, expect, it } from "vitest";
import type { LookSnapshot } from "@/features/viewer";
import {
  batchJobTarget,
  batchRenderTargets,
  estimateBatchJobCount,
  type BatchExportJob,
} from "@/lib/variants/batch-export";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import type { ModelVariant } from "@/lib/variants/types";

function batchJob(sceneId: number, sceneLabel: string, variant: Pick<ModelVariant, "id" | "name"> | null): BatchExportJob {
  return {
    sceneId,
    sceneLabel,
    viewerId: `viewer-${sceneId}`,
    modelUrl: `/models/${sceneId}.glb`,
    modelConfig: buildModelConfigFromSlots(["Metal 1"]),
    variant: variant as ModelVariant | null,
    snapshot: {} as BatchExportJob["snapshot"],
  };
}

describe("batchJobTarget", () => {
  it("renders the current scene's live look where it renders no variant", () => {
    expect(batchJobTarget(batchJob(812, "Solitaire", null), 812)).toEqual({
      sceneId: 812,
      variantId: null,
      live: true,
      label: "solitaire-live",
    });
  });

  it("names a saved variant, of this scene or another, which the API reads from the scene", () => {
    expect(batchJobTarget(batchJob(812, "Solitaire", { id: "variant-rose", name: "Rose gold" }), 812)).toEqual({
      sceneId: 812,
      variantId: "variant-rose",
      live: false,
      label: "solitaire-rose_gold",
    });
    expect(batchJobTarget(batchJob(913, "Halo band", { id: "variant-pt", name: "Platinum" }), 812).variantId).toBe(
      "variant-pt",
    );
  });

  it("renders another scene without variants as it was saved", () => {
    expect(batchJobTarget(batchJob(913, "Halo band", null), 812)).toMatchObject({ sceneId: 913, variantId: null, live: false });
  });
});

describe("batchRenderTargets", () => {
  it("sends the studio's look for the current scene's live job only, and ends each file stem the same", () => {
    const look = { material: "platinum", lighting: "studio" } as LookSnapshot;
    const targets = [
      batchJobTarget(batchJob(812, "Solitaire", null), 812),
      batchJobTarget(batchJob(812, "Solitaire", { id: "variant-rose", name: "Rose gold" }), 812),
      batchJobTarget(batchJob(913, "Halo band", null), 812),
    ];

    expect(batchRenderTargets(targets, look, "360")).toEqual([
      { sceneId: 812, variantId: null, look, name: "solitaire-live-360" },
      { sceneId: 812, variantId: "variant-rose", look: null, name: "solitaire-rose_gold-360" },
      { sceneId: 913, variantId: null, look: null, name: "halo_band-live-360" },
    ]);
  });
});

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
