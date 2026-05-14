"use client";

import { Center, Environment, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { Suspense, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { createGemMaterial } from "@/lib/gem-gpu/gem-physical-material";
import { getCutById, type CutId } from "@/lib/stones/cut-geometries";

type StoneTileProps = { cutId: CutId; label: string; description: string };

export function StoneTile({ cutId, label, description }: StoneTileProps) {
  const cut = getCutById(cutId);
  if (!cut) return null;
  const geometry = useMemo(() => cut.build(), [cut]);
  const material = useMemo(() => createGemMaterial("diamond"), []);

  return (
    <Link
      href={`/stones/${cutId}`}
      className="group block focus:outline-none"
      aria-label={`Open ${label} in studio`}
    >
      <Card className="overflow-hidden border-border bg-card shadow-sm transition group-hover:shadow-md">
        <div className="relative aspect-square bg-gradient-to-br from-stone-100 via-neutral-50 to-stone-200">
          <Canvas
            className="h-full w-full"
            camera={{ position: [1.4, 0.9, 1.4], fov: 38, near: 0.01, far: 50 }}
            gl={{ alpha: true, antialias: true, toneMappingExposure: 0.95 }}
            dpr={[1, 2]}
          >
            <ambientLight intensity={0.4} />
            <Suspense fallback={null}>
              <Environment files="/hdr/photo_studio_01_1k.hdr" background={false} />
              <Center>
                <mesh geometry={geometry} material={material} />
              </Center>
              <OrbitControls
                makeDefault={false}
                enableZoom={false}
                enablePan={false}
                autoRotate
                autoRotateSpeed={1.1}
              />
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
