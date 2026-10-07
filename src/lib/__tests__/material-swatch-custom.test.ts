import { afterEach, describe, expect, it } from "vitest";
import { getPresetSwatchColor, swatchShape } from "@/lib/material-swatch";
import type { UserMaterialItem } from "@/lib/library/types";
import { useUserLibraryStore } from "@/stores/user-library-store";

function libraryMaterial(fields: Pick<UserMaterialItem, "id" | "kind" | "params">): UserMaterialItem {
  return { slug: `material-${fields.id}`, label: `Material ${fields.id}`, swatch_url: null, sort_weight: 0, ...fields };
}

afterEach(() => {
  useUserLibraryStore.getState().removeMaterial(7);
  useUserLibraryStore.getState().removeMaterial(8);
});

describe("a library material's swatch", () => {
  it("draws a registered gem faceted in its own colour, and a metal as a metal in its own", () => {
    useUserLibraryStore.getState().upsertMaterial(libraryMaterial({ id: 7, kind: "gem", params: { baseColor: "#1E5BD8" } }));
    useUserLibraryStore.getState().upsertMaterial(libraryMaterial({ id: 8, kind: "metal", params: { color: "#E8B4A0" } }));

    expect([getPresetSwatchColor("custom:7"), swatchShape("custom:7")]).toEqual(["#1E5BD8", "faceted"]);
    expect([getPresetSwatchColor("custom:8"), swatchShape("custom:8")]).toEqual(["#E8B4A0", "metal"]);
  });

  it("stays a grey metal until its material is registered", () => {
    expect([getPresetSwatchColor("custom:7"), swatchShape("custom:7")]).toEqual(["#9CA3AF", "metal"]);
  });
});
