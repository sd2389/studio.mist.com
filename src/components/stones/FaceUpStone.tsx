"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import type * as THREE from "three";

/**
 * Camera for a stone seen face-up: from just in front of straight above, so the table faces
 * the viewer and the stone's length runs up and down the screen.
 */
export const FACE_UP_CAMERA = { position: [0, 4.6, 0.95] as [number, number, number], fov: 38 };

/**
 * A loose stone presented the way a jeweller shows one: face up, its point (the cut's +x end)
 * toward the bottom of the screen. Instead of spinning, which would swing the point round, it
 * rocks a few degrees either way so the facets keep catching the light.
 */
export function FaceUpStone({ rocking = true, children }: { rocking?: boolean; children: ReactNode }) {
  const rock = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const group = rock.current;
    if (!group) return;
    const t = clock.elapsedTime;
    group.rotation.x = rocking ? Math.sin(t * 0.9) * 0.12 : 0;
    group.rotation.z = rocking ? Math.sin(t * 0.55 + 1.3) * 0.07 : 0;
  });
  return (
    <group ref={rock}>
      {/* Length (+x, the point) toward +z: the bottom of the screen for a camera above and in front. */}
      <group rotation={[0, -Math.PI / 2, 0]}>{children}</group>
    </group>
  );
}
