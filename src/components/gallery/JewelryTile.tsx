"use client";

import { Center, Environment, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { Card, CardContent } from "@/components/ui/card";
import { createGemMaterial } from "@/lib/gem-gpu/gem-physical-material";
import { createPresetMaterial } from "@/lib/material-presets";
import { getJewelryById, getRole, type JewelryId } from "@/lib/jewelry/assembly";

type Props = { id: JewelryId; label: string; description: string };

export function JewelryTile({ id, label, description }: Props) {
  const piece = getJewelryById(id);
  const root = useMemo(() => (piece ? piece.build() : null), [piece]);
  const metal = useMemo(() => createPresetMaterial("gold-18k-yellow"), []);
  const gem = useMemo(() => createGemMaterial("diamond"), []);

  useEffect(() => {
    if (!root) return;
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const role = getRole(o);
      if (role === "metal") o.material = metal;
      else if (role === "gem" || role === "accent-gem") o.material = gem;
    });
  }, [root, metal, gem]);

  if (!piece || !root) return null;

  return (
    <Link
      href={`/gallery/${id}`}
      className="group block focus:outline-none"
      aria-label={`Open ${label} in studio`}
    >
      <Card className="overflow-hidden border-border bg-card shadow-sm transition group-hover:shadow-md">
        <div className="relative aspect-square bg-gradient-to-br from-stone-100 via-neutral-50 to-stone-200">
          <Canvas
            className="h-full w-full"
            camera={{ position: [1.6, 0.9, 1.6], fov: 38, near: 0.01, far: 50 }}
            gl={{ alpha: true, antialias: true, toneMappingExposure: 0.95 }}
            dpr={[1, 2]}
          >
            <ambientLight intensity={0.4} />
            <Suspense fallback={null}>
              <Environment files="/hdr/photo_studio_01_1k.hdr" background={false} />
              <Center>
                <primitive object={root} />
              </Center>
              <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1.1} />
            </Suspense>
          </Canvas>
        </div>
        <CardContent className="space-y-1 p-4">
          <p className="font-medium text-foreground">{label}</p>
          <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
