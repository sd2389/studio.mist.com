"use client";

import { Canvas, useLoader } from "@react-three/fiber";
import { Center, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import * as THREE from "three";
import { STLLoader } from "three-stdlib";
import { Rhino3dmLoader } from "three/examples/jsm/loaders/3DMLoader.js";
import { modelExtFromUrl } from "@/lib/model-key";
import { smoothStlGeometry } from "@/lib/stl-smoothing";

const RHINO3DM_LIBRARY_PATH = "https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/";

type ScenePreviewCanvasProps = {
  modelUrl: string;
};

function fitToUnit(obj: THREE.Object3D, target = 1.4): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxEdge = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxEdge) || maxEdge <= 1e-6) return;
  obj.scale.multiplyScalar(target / maxEdge);
}

function GltfPreview({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const cloned = scene.clone(true);
    fitToUnit(cloned);
    return cloned;
  }, [scene]);
  return <primitive object={model} />;
}

function Rhino3dmPreview({ url }: { url: string }) {
  const loaded = useLoader(Rhino3dmLoader, url, (loader) => {
    (loader as Rhino3dmLoader).setLibraryPath(RHINO3DM_LIBRARY_PATH);
  });
  const node = useMemo(() => {
    const cloned = loaded.clone(true);
    cloned.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry) {
        o.geometry.computeVertexNormals();
      }
    });
    fitToUnit(cloned);
    return cloned;
  }, [loaded]);
  return <primitive object={node} />;
}

function StlPreview({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url) as THREE.BufferGeometry;
  const node = useMemo(() => {
    const geom = smoothStlGeometry(geometry);
    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshPhysicalMaterial({
        color: 0xd4d4d8,
        metalness: 1,
        roughness: 0.18,
        clearcoat: 0.5,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.4,
      }),
    );
    const group = new THREE.Group();
    group.add(mesh);
    fitToUnit(group);
    return group;
  }, [geometry]);
  return <primitive object={node} />;
}

export function ScenePreviewCanvas({ modelUrl }: ScenePreviewCanvasProps) {
  const ext = modelExtFromUrl(modelUrl);
  return (
    <Canvas
      className="size-full"
      camera={{ position: [1.5, 0.9, 1.5], fov: 38, near: 0.01, far: 50 }}
      gl={{ alpha: true, antialias: true, toneMappingExposure: 0.95 }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.4} />
      <Suspense fallback={null}>
        <Environment files="/hdr/photo_studio_01_1k.hdr" background={false} />
        <Center>
          {ext === "stl" ? (
            <StlPreview url={modelUrl} />
          ) : ext === "3dm" ? (
            <Rhino3dmPreview url={modelUrl} />
          ) : (
            <GltfPreview url={modelUrl} />
          )}
        </Center>
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableRotate={false}
          autoRotate
          autoRotateSpeed={1.1}
        />
      </Suspense>
    </Canvas>
  );
}
