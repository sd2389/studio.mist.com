import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { viewerHref } from "@/components/dashboard/scene-display";
import type { Scene } from "@/features/scene";

function sceneWithKey(model_key: string): Scene {
  return { model_key } as Scene;
}

describe("default Edit path", () => {
  it("viewerHref returns a /viewer/ URL and never /model/", () => {
    const href = viewerHref(sceneWithKey("customers/1/models/ring.glb"));
    expect(href.startsWith("/viewer/")).toBe(true);
    expect(href.includes("/model/")).toBe(false);
    expect(href).toBe("/viewer/ring.glb");
  });

  it("viewer page source does not redirect saved scenes to /model/", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/app/viewer/[id]/page.tsx"),
      "utf8",
    );
    expect(src.includes("redirect(`/model/")).toBe(false);
    expect(src.includes('redirect("/model/')).toBe(false);
  });
});
