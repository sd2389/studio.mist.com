'use client';

import { Environment, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { MotionValue } from 'framer-motion';
import * as THREE from 'three';
import { WebGPUCanvas } from '@/lib/gpu/WebGPUCanvas';
import { createGemMaterial } from '@/lib/gem-gpu/gem-physical-material';
import { setJewelryGemTime } from '@/lib/gem-gpu/jewelry-gem-shader';
import { SHOWCASE_MODEL_URL } from '@/lib/bundled-scenes';

type Props = { progress: MotionValue<number>; active: boolean; reducedMotion: boolean; onReady: () => void };

function Ring({ progress, reducedMotion, onReady }: Omit<Props, 'active'>) {
  const { scene } = useGLTF(SHOWCASE_MODEL_URL);
  const group = useRef<THREE.Group>(null);
  const ready = useRef(false);
  const materials = useMemo(() => ({
    metal: new THREE.MeshPhysicalMaterial({ color: '#d5dce1', metalness: 1, roughness: 0.12, envMapIntensity: 1.7 }),
    gem: createGemMaterial('diamond'),
    wire: new THREE.MeshBasicMaterial({ color: '#537b88', wireframe: true, transparent: true, opacity: 0.55 }),
  }), []);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = object.name.startsWith('Gem') ? materials.gem : materials.metal;
    });
    return clone;
  }, [scene, materials]);
  useEffect(() => () => { Object.values(materials).forEach((material) => material.dispose()); }, [materials]);

  useFrame(() => {
    const p = reducedMotion ? 1 : progress.get();
    const exploded = Math.sin(Math.PI * THREE.MathUtils.clamp((p - 0.15) / 0.7, 0, 1)) * 0.35;
    if (group.current) {
      group.current.rotation.set(0.85 + p * 0.12, -0.35 + p * 1.15, -0.22);
      group.current.position.y = -0.2 - exploded * 0.2;
    }
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const isGem = object.name.startsWith('Gem');
      object.position.y = isGem ? exploded : 0;
      object.material = p > 0.06 && p < 0.25 ? materials.wire : isGem ? materials.gem : materials.metal;
    });
    setJewelryGemTime(materials.gem, p * 5);
    // This runs only after the HDR and model suspense resources have resolved.
    if (!ready.current) { ready.current = true; onReady(); }
  });
  return <group ref={group}><primitive object={model} /></group>;
}

export function LandingRing({ active, ...props }: Props) {
  return (
    <WebGPUCanvas camera={{ position: [0, 0.45, 3.2], fov: 35, near: 0.01, far: 30 }} dpr={[1, 1.5]} frameloop={active ? 'always' : 'never'} style={{ pointerEvents: 'none' }}>
      <ambientLight intensity={0.3} />
      <directionalLight position={[2, 4, 3]} intensity={1.4} />
      <Environment files='/hdr/photo_studio_01_1k.hdr' />
      <Ring {...props} />
    </WebGPUCanvas>
  );
}
