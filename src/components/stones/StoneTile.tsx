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
  const geometry = useMemo(() => (cut ? cut.build() : null), [cut]);
  const material = useMemo(() => createGemMaterial("diamond"), []);

  if (!cut || !geometry) return null;

  return (
    <Link
      href={`/stones/${cutId}`}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open ${label} in studio`}
    >
      <Card className="overflow-hidden rounded-none border border-black bg-[#11110f] p-0 text-white ring-0 transition duration-300 group-hover:bg-black">
        <div className="relative aspect-square overflow-hidden bg-[radial-gradient(circle_at_50%_42%,#51515a_0%,#27272c_48%,#19191c_100%)]">
          <span className="absolute left-4 top-4 z-10 border border-white/20 bg-black/30 px-2.5 py-1 text-[8px] uppercase tracking-[0.14em] text-white/60 backdrop-blur">
            Precision cut
          </span>
          <Canvas
            className="h-full w-full"
            camera={{ position: [1.4, 0.9, 1.4], fov: 38, near: 0.01, far: 50 }}
            gl={{ alpha: true, antialias: true, toneMappingExposure: 0.95 }}
            dpr={[1, 2]}
          >
            <ambientLight intensity={0.4} />
            <Suspense fallback={null}>
              <Environment
                files="/hdr/photo_studio_01_1k.hdr"
                background={false}
              />
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
        <CardContent className="space-y-2 p-5">
          <p className="text-2xl font-black uppercase tracking-[-0.05em] text-white">
            {label}
          </p>
          <p className="line-clamp-2 text-xs leading-5 text-white/42">
            {description}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
