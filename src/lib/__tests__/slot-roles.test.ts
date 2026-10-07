import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import { slotRoles } from "@/lib/upload/slot-roles";

/** A mesh of `triangles` triangles stamped with its slot, and the role the loaders gave it (if any). */
function mesh(slot: string, role: string | null, triangles = 1): THREE.Mesh {
  const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(triangles * 9), 3));
  const object = new THREE.Mesh(geometry);
  object.userData.devjewelsSlot = slot;
  if (role) object.userData.jewelryRole = role;
  return object;
}

const modelOf = (...meshes: THREE.Mesh[]) => new THREE.Group().add(...meshes);

describe("slotRoles", () => {
  it("gives each slot the role its meshes have, accent stones as accent", () => {
    const root = modelOf(mesh("Metal 1", "metal"), mesh("Gem 1", "gem"), mesh("Accent 1", "accent-gem"), mesh("Accent 1", "accent-gem"));
    const config = buildModelConfigFromSlots(["Metal 1", "Gem 1", "Accent 1"]);
    expect(slotRoles(root, config)).toEqual({ roles: { "Accent 1": "accent", "Gem 1": "gem", "Metal 1": "metal" }, assumed: [] });
  });

  it("goes by the role of most of a slot's meshes, a tie by their triangles", () => {
    const root = modelOf(mesh("Pave", "gem"), mesh("Pave", "gem"), mesh("Pave", "metal", 50), mesh("Mixed", "gem", 2), mesh("Mixed", "metal", 9));
    const config = buildModelConfigFromSlots(["Pave", "Mixed"]);
    expect(slotRoles(root, config).roles).toEqual({ Mixed: "metal", Pave: "gem" });
  });

  it("names a 'Pave' layer the segmentation calls stones a gem, though its slot has no kind", () => {
    const config = buildModelConfigFromSlots(["Metal 1", "Pave"]);
    expect(config.slots.find((slot) => slot.slotId === "Pave")?.kind).toBe("default");
    expect(slotRoles(modelOf(mesh("Metal 1", "metal"), mesh("Pave", "gem")), config).roles.Pave).toBe("gem");
  });

  it("takes a slot's role from its name when none of its meshes says, and lists it", () => {
    const root = modelOf(mesh("Metal 1", null), mesh("Gem 1", null), mesh("Accent 2", null), mesh("Logo", null));
    const config = buildModelConfigFromSlots(["Metal 1", "Gem 1", "Accent 2", "Logo"]);
    expect(slotRoles(root, config)).toEqual({
      roles: { "Accent 2": "accent", "Gem 1": "gem", Logo: "metal", "Metal 1": "metal" },
      assumed: ["Accent 2", "Gem 1", "Logo", "Metal 1"],
    });
  });

  it("matches slots as the studio does: 'Metal 01' is 'Metal 1'", () => {
    const config = buildModelConfigFromSlots(["Metal 01"]);
    expect(slotRoles(modelOf(mesh("Metal 1", "metal")), config)).toEqual({ roles: { "Metal 01": "metal" }, assumed: [] });
  });
});
