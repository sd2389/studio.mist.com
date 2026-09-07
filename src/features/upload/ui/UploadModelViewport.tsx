"use client";

import { Center, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";
import { detectSlots } from "@/lib/slot-materials/detect-slots";
import { cn } from "@/lib/utils";

const FIT_SIZE = 1.8;
const STUDIO_BG = "#eef2f7";
const GEM_SCALE = ["#3b82f6", "#60a5fa", "#2563eb", "#93c5fd"];
const METAL_SCALE = ["#d7dde6", "#c3cad6", "#b0b9c8", "#9aa5b6"];
const DEFAULT_METAL = "#c9d0da";

type SlotCounters = { gem: number; metal: number };

function isGemSlot(slot: string): boolean {
  return slot.startsWith("Gem") || slot.startsWith("Accent");
}

function slotColor(slot: string, counters: SlotCounters): string {
  if (isGemSlot(slot)) {
    const idx = counters.gem++;
    return GEM_SCALE[idx % GEM_SCALE.length]!;
  }
  if (slot === "default") return DEFAULT_METAL;
  const idx = counters.metal++;
  return METAL_SCALE[idx % METAL_SCALE.length]!;
}

function toCadStyleMaterial(color: string, hidden: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.18,
    transparent: hidden,
    opacity: hidden ? 0.15 : 1,
    side: THREE.DoubleSide,
  });
}

function fitToUnit(obj: THREE.Object3D, targetSize: number): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxEdge = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxEdge) || maxEdge <= 1e-6) return;
  const factor = targetSize / maxEdge;
  obj.scale.multiplyScalar(factor);
}

function buildSlotColorMap(slotList: string[]): Record<string, string> {
  const counters: SlotCounters = { gem: 0, metal: 0 };
  const out: Record<string, string> = {};
  for (const slot of slotList) {
    out[slot] = slotColor(slot, counters);
  }
  return out;
}

function applyPreviewMaterials(
  raw: THREE.Object3D,
  slotColors: Record<string, string>,
  hiddenSlots: Set<string>,
  slotTokens?: Record<string, string[]>,
): THREE.Object3D {
  const cloned = raw.clone(true);
  const slotMap = detectSlots(cloned, slotTokens);
  const slotMaterials = new Map<string, THREE.Material>();

  for (const slot of slotMap.keys()) {
    const fallback = isGemSlot(slot)
      ? GEM_SCALE[0]!
      : slot === "default"
        ? DEFAULT_METAL
        : METAL_SCALE[0]!;
    const color = slotColors[slot] ?? fallback;
    slotMaterials.set(slot, toCadStyleMaterial(color, hiddenSlots.has(slot)));
  }

  const assigned = new Set<THREE.Mesh>();
  for (const [slot, meshes] of slotMap.entries()) {
    const mat = slotMaterials.get(slot);
    if (!mat) continue;
    for (const mesh of meshes) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material?.dispose();
      mesh.material = mat.clone();
      mesh.userData.slotId = slot;
      mesh.visible = !hiddenSlots.has(slot);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      assigned.add(mesh);
    }
  }

  // Any mesh missed by slot detection still gets a studio-safe metal, never a
  // dark imported CAD material that reads as black on the light stage.
  cloned.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || assigned.has(node)) return;
    if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
    else node.material?.dispose();
    node.material = toCadStyleMaterial(DEFAULT_METAL, false);
    node.userData.slotId = "default";
    node.castShadow = false;
    node.receiveShadow = false;
  });

  fitToUnit(cloned, FIT_SIZE);
  return cloned;
}

type UploadModelViewportProps = {
  root: THREE.Object3D | null;
  slots: string[];
  hiddenSlots?: Set<string>;
  slotTokens?: Record<string, string[]>;
  className?: string;
  emptyLabel?: string;
};

export function UploadModelViewport({
  root,
  slots,
  hiddenSlots = new Set(),
  slotTokens,
  className,
  emptyLabel = "Drop a model to preview",
}: UploadModelViewportProps) {
  const slotList = useMemo(() => (slots.length > 0 ? slots : ["Metal 01"]), [slots]);
  const slotColors = useMemo(() => buildSlotColorMap(slotList), [slotList]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const model = useMemo(() => {
    if (!root) return null;
    return applyPreviewMaterials(root, slotColors, hiddenSlots, slotTokens);
  }, [root, slotColors, hiddenSlots, slotTokens]);

  const handlePick = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const slot = event.object?.userData?.slotId;
    if (typeof slot === "string" && slot) setSelectedSlot(slot);
  };

  return (
    <div
      className={cn("relative h-full min-h-[320px] overflow-hidden", className)}
      style={{ background: STUDIO_BG }}
    >
      {model ? (
        <>
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-black/10 bg-white/75 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-black/60 backdrop-blur-sm">
            {selectedSlot ? `Layer: ${selectedSlot}` : "Orbit to inspect"}
          </div>
          <Canvas
            camera={{ position: [0, 0.55, 2.35], fov: 38 }}
            gl={{ antialias: true, alpha: false }}
            style={{ background: STUDIO_BG }}
          >
            <color attach="background" args={[STUDIO_BG]} />
            <hemisphereLight args={["#ffffff", "#c8d2de", 0.95]} />
            <ambientLight intensity={0.55} />
            <directionalLight position={[4, 6, 3]} intensity={1.05} color="#ffffff" />
            <directionalLight position={[-3, 2, -2]} intensity={0.45} color="#e8eef6" />
            <Center>
              <primitive object={model} onPointerDown={handlePick} />
            </Center>
            <OrbitControls enablePan={false} />
          </Canvas>
        </>
      ) : (
        <div className="flex h-full min-h-[320px] items-center justify-center px-6 text-center">
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        </div>
      )}
    </div>
  );
}
