"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useFilmTheme } from "@/components/scroll-film/film-theme";
import { RenderFidelityBridge } from "@/features/render";
import { SceneEnvironmentBridge, ViewerPostFX } from "@/features/viewer";
import { prepareGemTraceMesh } from "@/lib/gem-gpu/gem-trace-material";
import { ViewerContactShadows } from "@/lib/gpu/ViewerContactShadows";
import { WebGPUCanvas } from "@/lib/gpu/WebGPUCanvas";
import { partToMesh, type BuiltPart, type PieceKind } from "@/lib/jewelry-cad";
import { cameraPoseFor, PREVIEW_UNITS_PER_MM, type CameraPose, type PreviewView } from "@/features/ring-builder/domain/preview-views";
import { previewMaterialFor } from "@/features/ring-builder/ui/preview-materials";

/**
 * The preview stage follows the site's look: the white photo studio on paper, the home
 * film's dark stage (and its sparkle tent) in dark mode. It is a preview, not a saved
 * scene, so it can take the theme.
 */
const STAGES = {
  light: { background: "#eaeff5", hdr: "/hdr/photo_studio_01_2k.hdr", tent: "white", exposure: 0.9 },
  dark: { background: "#0b0c10", hdr: "/hdr/studio_small_08_2k.hdr", tent: "sparkle", exposure: 0.86 },
} as const;

export type DesignCanvasProps = {
  parts: BuiltPart[];
  kind: PieceKind;
  hasCenterStone: boolean;
  view: PreviewView;
  /** Changes whenever the user picks a view, so picking the same view again re-frames. */
  viewNonce: number;
  autoRotate: boolean;
};

type Placement = { group: THREE.Group; floorY: number; headY: number };

/** Slot meshes, scaled from mm and centred; the head height feeds the "detail" camera. */
function usePlacement(parts: BuiltPart[], hasCenterStone: boolean): Placement {
  return useMemo(() => {
    const group = new THREE.Group();
    const box = new THREE.Box3();
    for (const part of parts) {
      const mesh = partToMesh(part, previewMaterialFor(part));
      // Register the facet planes now rather than on first draw (one untraced frame).
      if (part.role !== "metal") prepareGemTraceMesh(mesh);
      group.add(mesh);
      if (part.geometry.boundingBox) box.union(part.geometry.boundingBox);
    }
    const s = PREVIEW_UNITS_PER_MM;
    const center = box.getCenter(new THREE.Vector3());
    group.scale.setScalar(s);
    group.position.copy(center).multiplyScalar(-s);
    // Detail framing: the center stone, or the top of the band when there is none.
    const gem = parts.find((p) => p.slot === "Gem 1")?.geometry.boundingBox;
    const focusY = hasCenterStone && gem ? gem.getCenter(new THREE.Vector3()).y : box.max.y - (box.max.y - box.min.y) * 0.08;
    return { group, floorY: (box.min.y - center.y) * s - 0.02, headY: (focusY - center.y) * s };
  }, [parts, hasCenterStone]);
}

/** Metals reflect the studio HDR; traced gems see the procedural jewelry tent. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Orbit controls plus eased moves to the chosen view. */
function CameraRig({ pose, poseKey, autoRotate }: { pose: CameraPose; poseKey: string; autoRotate: boolean }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const move = useRef<{ fromPos: THREE.Vector3; fromTarget: THREE.Vector3; t: number } | null>(null);
  const first = useRef(true);
  const poseRef = useRef(pose);

  useLayoutEffect(() => {
    poseRef.current = pose;
  });

  useEffect(() => {
    if (!controls) return;
    if (first.current) {
      first.current = false;
      camera.position.set(...poseRef.current.position);
      controls.target.set(...poseRef.current.target);
      controls.update();
      return;
    }
    move.current = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), t: 0 };
  }, [poseKey, controls, camera]);

  useFrame((_, dt) => {
    const m = move.current;
    if (!m || !controls) return;
    m.t = Math.min(1, m.t + dt / 0.75);
    const k = easeInOut(m.t);
    const p = poseRef.current;
    camera.position.lerpVectors(m.fromPos, new THREE.Vector3(...p.position), k);
    controls.target.lerpVectors(m.fromTarget, new THREE.Vector3(...p.target), k);
    controls.update();
    if (m.t >= 1) move.current = null;
  });

  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={0.3}
      maxDistance={7}
      autoRotate={autoRotate}
      autoRotateSpeed={0.55}
    />
  );
}

function Piece({ parts, kind, hasCenterStone, view, viewNonce, autoRotate }: DesignCanvasProps) {
  const { group, floorY, headY } = usePlacement(parts, hasCenterStone);
  const pose = cameraPoseFor(view, kind, headY);
  return (
    <>
      <primitive object={group} />
      <ViewerContactShadows position={[0, floorY, 0]} opacity={0.2} scale={8} />
      <CameraRig pose={pose} poseKey={`${view}:${viewNonce}`} autoRotate={autoRotate} />
    </>
  );
}

export default function DesignCanvas(props: DesignCanvasProps) {
  const stage = STAGES[useFilmTheme() ?? "light"];
  return (
    <WebGPUCanvas
      className="h-full w-full touch-none"
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={[1, 2]}
      camera={{ position: [1.55, 0.95, 2.05], fov: 30, near: 0.01, far: 100 }}
    >
      <color attach="background" args={[stage.background]} />
      <ambientLight intensity={0.3} />
      <spotLight position={[3.5, 6, 3.5]} angle={0.35} penumbra={0.9} intensity={1.05} castShadow shadow-mapSize={[1024, 1024]} />
      <Suspense fallback={null}>
        <SceneEnvironmentBridge
          metal={{ file: stage.hdr, rotation: 0, intensity: 1 }}
          gem={{ file: null, tent: stage.tent, rotation: 0, intensity: 1 }}
        />
        <Piece {...props} />
        <ViewerPostFX />
        <RenderFidelityBridge exposure={stage.exposure} />
      </Suspense>
    </WebGPUCanvas>
  );
}
