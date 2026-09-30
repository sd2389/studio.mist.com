"use client";

import { Center, Environment, OrbitControls } from "@react-three/drei";
import { WebGPUCanvas } from "@/lib/gpu/WebGPUCanvas";
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
      <Card className="overflow-hidden rounded-[1.75rem] border border-black/[0.06] bg-[#eaeff5] p-0 text-black ring-0 transition duration-300 group-hover:bg-white">
        <div className="relative aspect-square overflow-hidden bg-[radial-gradient(circle_at_50%_42%,#ffffff_0%,#dfe7f0_50%,#cad6e3_100%)]">
          <span className="absolute left-4 top-4 z-10 border border-white/20 bg-black/30 px-2.5 py-1 text-[8px] uppercase tracking-[0.14em] text-white/60 backdrop-blur">
            Precision cut
          </span>
          <WebGPUCanvas
            className="h-full w-full"
            camera={{ position: [1.4, 0.9, 1.4], fov: 38, near: 0.01, far: 50 }}
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
          </WebGPUCanvas>
        </div>
        <CardContent className="space-y-2 p-5">
          <p className="text-2xl font-light tracking-[-0.05em] text-black">
            {label}
          </p>
          <p className="line-clamp-2 text-xs leading-5 text-black/45">
            {description}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
