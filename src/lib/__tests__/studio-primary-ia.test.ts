import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("studio primary IA", () => {
  it("primary bar exposes Metal, Gem, Light, Export, and More", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/features/viewer/ui/StudioPrimaryBar.tsx"),
      "utf8",
    );
    for (const label of ["Metal", "Gem", "Light", "Export", "More"]) {
      expect(src.includes(label), `missing ${label}`).toBe(true);
    }
  });

  it("scene buckets live in More, not primary bar", () => {
    const primary = readFileSync(
      path.join(process.cwd(), "src/features/viewer/ui/StudioPrimaryBar.tsx"),
      "utf8",
    );
    const more = readFileSync(
      path.join(process.cwd(), "src/features/viewer/ui/StudioMoreDrawer.tsx"),
      "utf8",
    );
    expect(primary.includes("ENVIRONMENT-METAL")).toBe(false);
    expect(more.includes("ENVIRONMENT-METAL") || more.includes("Scene buckets")).toBe(true);
  });
});
