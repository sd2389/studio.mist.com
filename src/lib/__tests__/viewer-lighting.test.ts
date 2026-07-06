import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  BG_BY_LIGHTING,
  HDR_FILE_BY_LIGHTING,
} from "@/lib/viewer-lighting";

const ALL_PRESETS = ["studio", "soft", "dark", "catalog", "dramatic"] as const;

describe("lighting presets", () => {
  it("defines every preset in every lookup table", () => {
    for (const id of ALL_PRESETS) {
      expect(HDR_FILE_BY_LIGHTING[id], `HDR for ${id}`).toBeTruthy();
      expect(BG_BY_LIGHTING[id], `background for ${id}`).toBeTruthy();
    }
  });

  it("points every preset at an HDR file that exists on disk", () => {
    for (const id of ALL_PRESETS) {
      const rel = HDR_FILE_BY_LIGHTING[id];
      const abs = path.join(process.cwd(), "public", rel);
      expect(existsSync(abs), `${rel} missing from public/`).toBe(true);
    }
  });
});
