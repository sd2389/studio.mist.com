import { expect, it } from "vitest";
import * as THREE from "three";
import { createJewelryEnvironmentApplicator } from "../apply-jewelry-environments";

it("changes diamond lighting independently and preserves physical reflection strengths", () => {
  const root = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ envMapIntensity: 1.2 });
  const diamond = new THREE.MeshPhysicalMaterial({ transmission: 1, envMapIntensity: 1.5 });
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), metal), new THREE.Mesh(new THREE.BoxGeometry(), diamond));
  const metalEnv = { texture: new THREE.Texture(), rotation: 0.2, intensity: 2 };
  const gemEnv = { texture: new THREE.Texture(), rotation: 0.8, intensity: 3 };
  const apply = createJewelryEnvironmentApplicator();
  apply(root, metalEnv, gemEnv);
  apply(root, metalEnv, { ...gemEnv, intensity: 4 });
  expect(metal.envMap).toBe(metalEnv.texture);
  expect(diamond.envMap).toBe(gemEnv.texture);
  expect(metal.envMapIntensity).toBe(2.4);
  expect(diamond.envMapIntensity).toBe(6);
  expect(metal.envMapRotation.y).toBe(0.2);
  expect(diamond.envMapRotation.y).toBe(0.8);
});
