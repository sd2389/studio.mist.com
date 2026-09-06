import { expect, it } from "vitest";
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from "three";
import { detectSlots } from "../slot-materials/detect-slots";

it("keeps numbered CAD gem layers distinct from a generic Gem block layer", () => {
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  mesh.name = "Gem 03";
  root.add(mesh);
  const slots = detectSlots(root, { "Gem 1": ["gem", "gem 01"], "Gem 3": ["gem 03"] });
  expect(slots.get("Gem 3")).toEqual([mesh]);
  expect(slots.has("Gem 1")).toBe(false);
});
