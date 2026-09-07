"use client";

import {
  Center,
  ContactShadows,
  Environment,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import * as THREE from "three";

const RING_URL = "/models/clearcoat/ClearcoatRing.gltf";
const HDR_URL = "/hdr/photo_studio_01_1k.hdr";

type LandingHeroRingProps = {
  active: boolean;
};

function fitToUnit(obj: THREE.Object3D, target = 1.55): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxEdge = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxEdge) || maxEdge <= 1e-6) return;
  obj.scale.multiplyScalar(target / maxEdge);
}

function RingModel() {
  const { scene } = useGLTF(RING_URL);
  const model = useMemo(() => {
    const cloned = scene.clone(true);
    fitToUnit(cloned);
    cloned.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const material = child.material;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.envMapIntensity = 1.15;
        material.needsUpdate = true;
      }
    });
    return cloned;
  }, [scene]);

  return (
    <Center>
      <primitive object={model} rotation={[0.18, 0.35, 0]} />
    </Center>
  );
}

function HeroScene({ active }: { active: boolean }) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3.2, 4.4, 2.2]} intensity={1.15} />
      <Suspense fallback={null}>
        <Environment files={HDR_URL} background={false} />
        <RingModel />
        <ContactShadows
          position={[0, -0.72, 0]}
          opacity={0.28}
          scale={8}
          blur={2.4}
          far={3}
        />
      </Suspense>
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={Math.PI / 3.2}
        maxPolarAngle={Math.PI / 1.75}
        autoRotate={active}
        autoRotateSpeed={0.55}
        makeDefault
      />
    </>
  );
}

export function LandingHeroRing({ active }: LandingHeroRingProps) {
  return (
    <Canvas
      className="h-full w-full touch-none"
      camera={{ position: [0.15, 0.55, 2.55], fov: 34, near: 0.01, far: 40 }}
      dpr={[1, 1.5]}
      frameloop={active ? "always" : "never"}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        toneMappingExposure: 1.05,
      }}
      onCreated={({ gl }) => {
        gl.domElement.style.touchAction = "none";
      }}
    >
      <HeroScene active={active} />
    </Canvas>
  );
}

useGLTF.preload(RING_URL);
