"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { abs, color, mix, mx_fractal_noise_float, positionLocal, sin, smoothstep } from "three/tsl";
import { MeshPhysicalNodeMaterial } from "three/webgpu";
import type { GemConfig } from "@/lib/gem-gpu/gem-configs";
import { applyGemTrace, gemTraceParamsFromConfig, prepareGemTraceMesh } from "@/lib/gem-gpu/gem-trace-material";
import type { ModelBounds } from "./use-model-bounds";

export type PlinthDims = { radius: number; height: number };

export function plinthDims(bounds: ModelBounds): PlinthDims {
  return { radius: Math.max(0.8, bounds.radius * 1.3), height: 0.9 };
}

/** Deterministic PRNG so a scene looks identical on every load, render and export. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Carrara: a warm white body with soft grey clouding and a few dominant veins whose width
 * wanders along their length. Evenly spaced iso-lines read as a map, not stone, so the
 * vein field is low-frequency and heavily warped.
 */
function createMarbleMaterial(): MeshPhysicalNodeMaterial {
  const p = positionLocal.mul(1.4);
  const warp = mx_fractal_noise_float(p.mul(0.9), 6, 2, 0.55, 1);
  const width = mx_fractal_noise_float(p.mul(3.1), 3, 2, 0.5, 1).abs().mul(0.05).add(0.012);
  const primary = smoothstep(0, width, abs(sin(p.x.mul(1.1).add(p.y.mul(0.55)).add(p.z.mul(0.35)).add(warp.mul(4.2))))).oneMinus();
  const secondary = smoothstep(0, 0.02, abs(sin(p.z.mul(2.6).sub(p.x.mul(0.8)).add(warp.mul(6.5))))).oneMinus();
  const cloud = mx_fractal_noise_float(p.mul(2.2), 5, 2, 0.5, 1).mul(0.5).add(0.5);
  const body = mix(color("#f5f3ee"), color("#dcd8d1"), cloud.mul(0.35));
  const veined = mix(body, color("#8f8b84"), primary.mul(0.5).add(secondary.mul(0.14)));
  const material = new MeshPhysicalNodeMaterial({ roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.06 });
  material.colorNode = veined;
  return material;
}

/** Pedestal profile with a small chamfer on the top edge, which catches a bright rim. */
function createPlinthGeometry({ radius, height }: PlinthDims): THREE.BufferGeometry {
  const chamfer = 0.025;
  const profile = [
    new THREE.Vector2(0, -height),
    new THREE.Vector2(radius, -height),
    new THREE.Vector2(radius, -chamfer),
    new THREE.Vector2(radius - chamfer, 0),
    new THREE.Vector2(0, 0),
  ];
  return new THREE.LatheGeometry(profile, 128);
}

export function MarblePlinth({ bounds, dims }: { bounds: ModelBounds; dims: PlinthDims }) {
  const geometry = useMemo(() => createPlinthGeometry(dims), [dims]);
  const material = useMemo(() => createMarbleMaterial(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[bounds.centerX, bounds.floorY, bounds.centerZ]}
      castShadow
      receiveShadow
    />
  );
}

const CLEAR_QUARTZ: GemConfig = {
  ior: 1.544,
  // ≈ quartz's 0.013 B–G dispersion after the trace's 0.55× mapping.
  dispersionBase: 0.024,
  dispersionAmplitude: 0,
  roughness: 0,
  thickness: 1,
  envMapIntensity: 1,
  baseColor: "#ffffff",
  attenuationColor: "#fbfcff",
  attenuationDistance: 2,
  transmission: 1,
};

/** One quartz point: hexagonal prism with a six-sided pyramid tip, convex, flat-shaded. */
function crystalPositions(radius: number, height: number): number[] {
  const ring = (y: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
    });
  const bottom = ring(-0.05);
  const top = ring(height);
  const apex = new THREE.Vector3(0, height + radius * 1.7, 0);
  const base = new THREE.Vector3(0, -0.05, 0);
  const out: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    tri(bottom[i]!, top[i]!, top[j]!);
    tri(bottom[i]!, top[j]!, bottom[j]!);
    tri(top[i]!, apex, top[j]!);
    tri(bottom[j]!, base, bottom[i]!);
  }
  return out;
}

/** A loose ring of quartz points around the piece, merged as islands of one traced mesh. */
function createCrystalGeometry(bounds: ModelBounds): THREE.BufferGeometry {
  const random = seededRandom(7);
  const positions: number[] = [];
  const count = 9;
  const matrix = new THREE.Matrix4();
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + random() * 0.4;
    const distance = bounds.radius * 1.25 + 0.25 + random() * 0.45;
    const height = 0.18 + random() * 0.42;
    const radius = 0.045 + random() * 0.05;
    const tilt = (0.15 + random() * 0.45) * (random() > 0.5 ? 1 : -1);
    matrix.compose(
      new THREE.Vector3(bounds.centerX + Math.cos(angle) * distance, bounds.floorY, bounds.centerZ + Math.sin(angle) * distance),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt * Math.sin(angle), random() * Math.PI, tilt * Math.cos(angle))),
      new THREE.Vector3(1, 1, 1),
    );
    const local = crystalPositions(radius, height);
    for (let k = 0; k < local.length; k += 3) {
      v.set(local[k]!, local[k + 1]!, local[k + 2]!).applyMatrix4(matrix);
      positions.push(v.x, v.y, v.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function QuartzCrystals({ bounds }: { bounds: ModelBounds }) {
  const { floorY, radius, centerX, centerZ } = bounds;
  const mesh = useMemo(() => {
    const material = new THREE.MeshPhysicalMaterial({ name: "SceneQuartz" });
    applyGemTrace(material, gemTraceParamsFromConfig(CLEAR_QUARTZ, 4));
    const crystals = new THREE.Mesh(createCrystalGeometry({ floorY, radius, centerX, centerZ }), material);
    crystals.castShadow = true;
    prepareGemTraceMesh(crystals);
    return crystals;
  }, [floorY, radius, centerX, centerZ]);
  useEffect(() => () => {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }, [mesh]);
  return <primitive object={mesh} />;
}

/**
 * Satin drape: fine diagonal folds that relax flat under the piece so it rests level, and a
 * sweep that rises behind it into its own backdrop — cloth hung the way a set dresser would,
 * with no horizon line.
 */
function createSilkGeometry(bounds: ModelBounds): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(10, 10, 260, 260);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  const flatRadius = Math.max(bounds.radius * 1.1, 0.45);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const along = x * 0.8 + z * 0.6;
    const folds =
      0.028 * Math.sin(along * 6 + 0.9 * Math.sin(z * 1.7)) +
      0.012 * Math.sin(x * 11.5 - z * 3.2) +
      0.006 * Math.sin(along * 23 + x * 2.1);
    const rest = THREE.MathUtils.smoothstep(Math.hypot(x, z), flatRadius, flatRadius * 2.6);
    const behind = Math.max(0, -z - 1.1);
    const sweep = behind * behind * 0.32;
    position.setY(i, (folds + 0.03) * rest + sweep);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function SilkDrape({ bounds }: { bounds: ModelBounds }) {
  const { floorY, radius, centerX, centerZ } = bounds;
  const geometry = useMemo(
    () => createSilkGeometry({ floorY, radius, centerX, centerZ }),
    [floorY, radius, centerX, centerZ],
  );
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#e8d6c0",
        roughness: 0.28,
        metalness: 0,
        sheen: 1,
        sheenColor: new THREE.Color("#fff6e8"),
        sheenRoughness: 0.25,
        anisotropy: 0.85,
        anisotropyRotation: Math.PI * 0.2,
        specularIntensity: 1,
        envMapIntensity: 1.3,
      }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} position={[centerX, floorY, centerZ]} receiveShadow />;
}
