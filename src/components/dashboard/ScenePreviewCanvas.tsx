"use client";

import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { StudioCanvas } from "@/features/viewer";
import { modelExtFromUrl } from "@/lib/model-key";

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

function LegacyPreviewNotice() {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
      Legacy format — open in viewer after re-upload as GLB
    </div>
  );
}

export function ScenePreviewCanvas({ modelUrl }: ScenePreviewCanvasProps) {
  const ext = modelExtFromUrl(modelUrl);
  const isGltf = ext === "glb" || ext === "gltf";

  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-border/60 bg-[#f4f1ea]">
      {isGltf ? (
        <StudioCanvas tile lighting="studio" autoRotate camera={{ position: [0, 0.2, 2.4], fov: 35 }}>
          <GltfPreview url={modelUrl} />
        </StudioCanvas>
      ) : (
        <LegacyPreviewNotice />
      )}
    </div>
  );
}
