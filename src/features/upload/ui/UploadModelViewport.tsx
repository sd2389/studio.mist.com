"use client";

import { Center, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";
import { detectSlots } from "@/lib/slot-materials/detect-slots";
import { cn } from "@/lib/utils";

const FIT_SIZE = 1.8;
const BLUE_SCALE = ["#0a49e8", "#1d6aff", "#2f86ff", "#57a2ff"];
const GREEN_SCALE = ["#08a46a", "#1bb980", "#33c995", "#5fd9b2"];

type SlotCounters = { gem: number; metal: number };

function slotColor(slot: string, counters: SlotCounters): string {
  if (slot.startsWith("Gem") || slot.startsWith("Accent")) {
    const idx = counters.gem++;
    return BLUE_SCALE[idx % BLUE_SCALE.length]!;
  }
  const idx = counters.metal++;
  return GREEN_SCALE[idx % GREEN_SCALE.length]!;
}

function toCadStyleMaterial(color: string, hidden: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.25,
    metalness: 0.08,
    transparent: hidden,
    opacity: hidden ? 0.15 : 1,
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
    const fallback =
      slot.startsWith("Gem") || slot.startsWith("Accent")
        ? BLUE_SCALE[0]!
        : slot === "default"
          ? "#8b95a1"
          : GREEN_SCALE[0]!;
    const color = slotColors[slot] ?? fallback;
    slotMaterials.set(slot, toCadStyleMaterial(color, hiddenSlots.has(slot)));
  }

  for (const [slot, meshes] of slotMap.entries()) {
    const mat = slotMaterials.get(slot);
    if (!mat) continue;
    for (const mesh of meshes) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material?.dispose();
      mesh.material = mat.clone();
      mesh.userData.slotId = slot;
      mesh.visible = !hiddenSlots.has(slot);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  }

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
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/60 bg-[#08090b]",
        className,
      )}
    >
      {model ? (
        <>
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-white/20 bg-black/65 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/90">
            {selectedSlot ? `Layer: ${selectedSlot}` : "Orbit to inspect"}
          </div>
          <Canvas camera={{ position: [0, 0.5, 2.2], fov: 38 }}>
            <color attach="background" args={["#08090b"]} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[3, 4, 2]} intensity={1.1} />
            <directionalLight position={[-2, -1, -2]} intensity={0.35} />
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
