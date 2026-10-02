"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import type { FilmTheme } from "@/components/scroll-film/film-theme";
import { RenderFidelityBridge } from "@/features/render";
import { resolveSceneSetup, SceneSetupStage } from "@/features/scene-setups";
import { SceneEnvironmentBridge, ViewerPostFX } from "@/features/viewer";
import { WebGPUCanvas } from "@/lib/gpu/WebGPUCanvas";
import { ASSEMBLY_CAMERA, createAssembly } from "./assembly";

/**
 * Each look's set: the backdrop, the mirror the finished ring stands on, the light tent its
 * stone reads, the studio its metal reflects, bloom and exposure. The hologram glows on its own over the dark stage (bloom
 * only lifts its brightest lines); on paper it is ink, so bloom drops further. AO stays
 * off: the hologram's lines would write the normals it reads and shade the paper behind
 * them, and a piece floating in a void has nothing for it to occlude.
 */
const LOOKS = {
  dark: {
    background: "#05060a",
    hdr: "/hdr/studio_small_08_2k.hdr",
    floor: "black-mirror",
    tent: "sparkle",
    postfx: { starGlints: true, bloom: 0.24, ao: false },
    exposure: 0.86,
  },
  // The studio's bright light preset: a white photo studio, so metal on paper reads bright.
  light: {
    background: "#eceef2",
    hdr: "/hdr/photo_studio_01_2k.hdr",
    floor: "white-mirror",
    tent: "white",
    postfx: { starGlints: true, bloom: 0.12, ao: false },
    exposure: 1,
  },
} as const;

/** Frames the mirror floor renders behind the preloader before the film decides. */
const WARM_UP_FRAMES = 8;

function AssemblyPlayer({ light, onFloor }: { light: boolean; onFloor: (on: boolean) => void }) {
  const [assembly] = useState(createAssembly);
  // The floor starts on so its shaders compile under the preloader, not mid-scroll.
  const floorOn = useRef(true);
  const warmFrames = useRef(WARM_UP_FRAMES);
  useEffect(() => () => assembly.dispose(), [assembly]);
  useEffect(() => assembly.setTheme(light), [assembly, light]);
  useFrame(({ camera, clock }, dt) => {
    const warming = warmFrames.current > 0;
    if (warming) warmFrames.current -= 1;
    const floor = assembly.update(camera, clock.elapsedTime, dt) || warming;
    if (floor !== floorOn.current) {
      floorOn.current = floor;
      onFloor(floor);
    }
  });
  return <primitive object={assembly.group} />;
}

/** The assembly's single canvas: fixed behind the page, a dark set for a hologram (or paper for its ink). */
export function Stage({ theme }: { theme: FilmTheme }) {
  const [floor, setFloor] = useState(true);
  const look = LOOKS[theme];
  return (
    <WebGPUCanvas className="!fixed inset-0 h-[100dvh] w-full" dpr={[1, 1.75]} camera={{ position: ASSEMBLY_CAMERA, fov: 32, near: 0.05, far: 300 }}>
      <color attach="background" args={[look.background]} />
      <ambientLight intensity={0.15} />
      <AssemblyPlayer light={theme === "light"} onFloor={setFloor} />
      <Suspense fallback={null}>
        <SceneEnvironmentBridge
          metal={{ file: look.hdr, rotation: 0, intensity: 1 }}
          gem={{ file: null, tent: look.tent, rotation: 0, intensity: 1 }}
        />
        {floor ? <SceneSetupStage setup={resolveSceneSetup(look.floor)} background={look.background} /> : null}
      </Suspense>
      <ViewerPostFX advanced={look.postfx} />
      <RenderFidelityBridge exposure={look.exposure} />
    </WebGPUCanvas>
  );
}
