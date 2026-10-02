import { describe, expect, it } from "vitest";
import { resolveModelUrl } from "@/lib/model-url";
import { modelCreditFor } from "./model-credit";

describe("modelCreditFor", () => {
  it("credits UX3D under CC BY 4.0 for the clearcoat demo", () => {
    const credit = modelCreditFor(resolveModelUrl("clearcoat"));
    expect(credit?.author).toBe("UX3D GmbH");
    expect(credit?.licence).toBe("CC BY 4.0");
  });

  it("needs no credit for our own or uploaded models", () => {
    expect(modelCreditFor(resolveModelUrl("mist-solitaire"))).toBeNull();
    expect(modelCreditFor("/api/files/models/abc-ring.glb")).toBeNull();
  });
});
