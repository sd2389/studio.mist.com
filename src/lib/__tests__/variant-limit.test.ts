import { describe, expect, it } from "vitest";
import type { ModelVariant, SceneVariantsState } from "@/lib/variants/types";
import {
  canAddVariant,
  isVariantLimitError,
  normalizeVariantsState,
  upsertVariant,
  variantLimitMessage,
} from "@/lib/variants/variant-utils";

function savedVariants(count: number): SceneVariantsState {
  const items = Array.from({ length: count }, (_, i) => ({
    id: `v${i + 1}`,
    name: `Variant ${i + 1}`,
    snapshot: { material: "gold-18k-yellow", lighting: "studio" },
  }));
  return normalizeVariantsState({ activeVariantId: null, items });
}

function oneMore(state: SceneVariantsState): ModelVariant {
  return { ...state.items[0]!, id: "new", name: "New" };
}

describe("canAddVariant", () => {
  it("allows adding below the plan's cap and stops at it", () => {
    expect(canAddVariant(savedVariants(2).items, 3)).toBe(true);
    expect(canAddVariant(savedVariants(3).items, 3)).toBe(false);
    expect(canAddVariant(savedVariants(10).items, 3)).toBe(false);
  });

  it("leaves the check to the server until the plan is read", () => {
    expect(canAddVariant(savedVariants(50).items, null)).toBe(true);
  });
});

describe("saved variants past a cap", () => {
  it("keeps every saved variant on load (a Studio scene can hold 50)", () => {
    expect(savedVariants(50).items).toHaveLength(50);
  });

  it("appends without trimming older variants", () => {
    const state = savedVariants(20);
    expect(upsertVariant(state, oneMore(state)).items).toHaveLength(21);
  });
});

describe("variant limit message", () => {
  it("reads like the server's 402 detail", () => {
    expect(variantLimitMessage("Free", 3)).toBe("Variant limit reached for Free (max 3 per model).");
  });

  it("recognises the server's refusal and nothing else", () => {
    expect(isVariantLimitError("Variant limit reached for Grow (max 15 per model).")).toBe(true);
    expect(isVariantLimitError("No AI image credits remaining.")).toBe(false);
    expect(isVariantLimitError("Failed to update scene")).toBe(false);
  });
});
