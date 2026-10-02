"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  cameraPosition,
  color,
  exp,
  float,
  length,
  mix,
  normalize,
  positionWorld,
  pow,
  reflector,
  sin,
  smoothstep,
  time,
  uniform,
  vec2,
} from "three/tsl";
import { MeshBasicNodeMaterial, type Node } from "three/webgpu";
import { ViewerContactShadows } from "@/lib/gpu/ViewerContactShadows";
import type { FloorSpec } from "../domain/scene-setups";
import type { ModelBounds } from "./use-model-bounds";

/** Large enough that its edge is always past the fade into the backdrop. */
const FLOOR_SIZE = 60;
/** World-space radius over which a reflective floor dissolves into the backdrop colour. */
const FADE_START = 2.4;
const FADE_END = 9;

type ReflectiveFloorOptions = {
  surface: string;
  background: string;
  reflectivity: number;
  roughness: number;
  rippleStrength: number;
};

/**
 * Unlit reflective floor that fades seamlessly into the canvas backdrop: where nothing is
 * reflected the reflection *is* the backdrop, so blending toward it leaves no horizon line.
 * Fresnel-weighted like a dielectric (acrylic, water), strongest at grazing angles.
 */
function createReflectiveFloor(options: ReflectiveFloorOptions) {
  const reflection = reflector({ resolutionScale: 0.75, generateMipmaps: options.roughness > 0.01 });
  const center = uniform(new THREE.Vector2());
  const distance = length(positionWorld.xz.sub(center));

  if (options.rippleStrength > 0) {
    // Slow concentric ripples spreading from the piece, damped with distance.
    const wave = sin(distance.mul(34).sub(time.mul(1.4))).mul(exp(distance.mul(-0.45)));
    const drift = sin(positionWorld.x.mul(7).add(time.mul(0.35))).mul(sin(positionWorld.z.mul(5).sub(time.mul(0.28))));
    const offset = wave.mul(0.0045).add(drift.mul(0.0012)).mul(options.rippleStrength);
    reflection.uvNode = reflection.uvNode!.add(vec2(offset, offset.mul(0.6)));
  }

  // Glossy surfaces read their reflection from a blurrier mip of the mirrored render.
  const sampled = (options.roughness > 0.01 ? reflection.level(float(options.roughness * 9)) : reflection) as unknown as Node<"vec4">;
  const toCamera = normalize(cameraPosition.sub(positionWorld));
  const schlick = float(0.04).add(float(0.96).mul(pow(float(1).sub(toCamera.y.clamp(0, 1)), 5)));
  const fade = smoothstep(FADE_START, FADE_END, distance);
  const strength = float(options.reflectivity).mul(float(0.3).add(schlick.mul(0.7))).mul(float(1).sub(fade));
  const base = mix(color(options.surface), color(options.background), fade);

  const material = new MeshBasicNodeMaterial();
  material.colorNode = mix(base, sampled.rgb, strength);
  return { material, reflection, center };
}

function ReflectiveFloor({ bounds, background, options }: { bounds: ModelBounds; background: string; options: Omit<ReflectiveFloorOptions, "background"> }) {
  const { surface, reflectivity, roughness, rippleStrength } = options;
  const floor = useMemo(
    () => createReflectiveFloor({ surface, background, reflectivity, roughness, rippleStrength }),
    [surface, background, reflectivity, roughness, rippleStrength],
  );
  useEffect(() => () => {
    floor.material.dispose();
    floor.reflection.dispose();
  }, [floor]);
  floor.center.value.set(bounds.centerX, bounds.centerZ);

  return (
    <group position={[0, bounds.floorY, 0]}>
      <primitive object={floor.reflection.target} rotation-x={-Math.PI / 2} />
      <mesh rotation-x={-Math.PI / 2} material={floor.material} renderOrder={-1}>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
      </mesh>
    </group>
  );
}

type SceneFloorProps = { floor: FloorSpec; bounds: ModelBounds; background: string };

/** The surface the piece rests on. Shadow floors reuse the viewer's contact shadow catcher. */
export function SceneFloor({ floor, bounds, background }: SceneFloorProps) {
  const shadowY = bounds.floorY + 0.001;
  if (floor.kind === "shadow") {
    return <ViewerContactShadows position={[0, shadowY, 0]} opacity={floor.opacity} scale={12} />;
  }
  const options =
    floor.kind === "mirror"
      ? { surface: floor.color, reflectivity: floor.reflectivity, roughness: floor.roughness, rippleStrength: 0 }
      : { surface: floor.color, reflectivity: floor.reflectivity, roughness: 0, rippleStrength: floor.rippleStrength };
  const shadowOpacity = floor.kind === "mirror" ? floor.shadowOpacity : 0;
  return (
    <>
      <ReflectiveFloor bounds={bounds} background={background} options={options} />
      <ViewerContactShadows position={[0, shadowY, 0]} opacity={shadowOpacity} scale={12} />
    </>
  );
}
