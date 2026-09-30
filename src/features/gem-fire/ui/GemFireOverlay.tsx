"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { createGemMaterial } from "@/lib/gem-gpu/gem-physical-material";
import type { GemPresetId } from "@/lib/gem-gpu/gem-configs";
import { SpectralPathTracer } from "@/lib/gem-fire/spectral-path-tracer";
import { useOrbitControlsStore } from "@/stores/orbit-controls-store";

/** How long the camera must hold still before the traced pass starts accumulating. */
const SETTLE_MS = 400;

/**
 * Composited samples required before the traced pass is allowed on screen.
 *
 * The raster view is crisp and instant, so revealing an unconverged trace is a downgrade
 * no matter how physically correct it is — noise reads as "broken" long before fire reads
 * as "better". The pass stays hidden until it can beat what it replaces.
 */
const MIN_VISIBLE_SAMPLES = 72;

type GemFireOverlayProps = {
  geometry: THREE.BufferGeometry | null;
  preset: GemPresetId | null;
  hdrFile: string;
  background: string;
  /** Skip the traced pass while the stone is spinning — it can never settle. */
  paused?: boolean;
};

/**
 * Path-traced gemstone pass layered over the raster viewer.
 *
 * Raster handles interaction, because a path tracer cannot keep up with an orbiting
 * camera. Once the camera holds still this fades in a spectrally-dispersed render of the
 * same stone — real internal bounces and real fire, which single-refraction raster
 * transmission cannot produce — and fades straight back out on the next interaction.
 */
export function GemFireOverlay({
  geometry,
  preset,
  hdrFile,
  background,
  paused = false,
}: GemFireOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  // The render loop reads and writes this; `visible` alone would be captured stale in the
  // effect closure, so the overlay would never fade back out on interaction.
  const visibleRef = useRef(false);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const show = (next: boolean) => {
    if (visibleRef.current === next) return;
    visibleRef.current = next;
    setVisible(next);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geometry || !preset) {
      setVisible(false);
      return;
    }

    let disposed = false;
    let tracer: SpectralPathTracer | null = null;
    let raf = 0;
    let settledAt = 0;
    const lastPose = new THREE.Vector3(Infinity, Infinity, Infinity);

    const material = createGemMaterial(preset);
    // A path tracer attenuates over real path length rather than the faked `thickness`
    // the raster path relies on, so the catalog's short attenuation distance would absorb
    // almost all light. A colourless stone is effectively non-absorbing.
    material.attenuationDistance = 24;
    material.transparent = false;

    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    scene.background = new THREE.Color(background);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);

    const sizeToHost = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      tracer?.setSize(w, h);
    };

    new RGBELoader().load(hdrFile, (texture) => {
      if (disposed) return;
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;

      tracer = new SpectralPathTracer({ canvas, scene, camera, material });
      sizeToHost();

      const tick = () => {
        if (disposed) return;
        raf = requestAnimationFrame(tick);

        if (pausedRef.current) {
          show(false);
          settledAt = performance.now();
          return;
        }

        const controls = useOrbitControlsStore.getState().controls;
        if (!controls) return;

        const moved = lastPose.distanceToSquared(controls.object.position) > 1e-8;
        if (moved) {
          lastPose.copy(controls.object.position);
          settledAt = performance.now();
          show(false);
          camera.position.copy(controls.object.position);
          camera.lookAt(controls.target);
          if (controls.object instanceof THREE.PerspectiveCamera) {
            camera.fov = controls.object.fov;
            camera.updateProjectionMatrix();
          }
          tracer?.updateCamera();
          return;
        }

        if (performance.now() - settledAt < SETTLE_MS) return;

        tracer?.renderFrame();
        if (tracer && tracer.samples >= MIN_VISIBLE_SAMPLES) show(true);
      };
      tick();
    });

    const onResize = () => sizeToHost();
    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      tracer?.dispose();
      material.dispose();
    };
  }, [geometry, preset, hdrFile, background]);

  // A fresh DOM node per (geometry, preset, hdr, background) combination guarantees a
  // pristine WebGL context for each `SpectralPathTracer`. Reusing one persistent canvas
  // across effect re-runs — even with the prior renderer disposed — left the tracer
  // silently stuck at zero samples on some preset switches during testing.
  const instanceKey = `${geometry ? geometry.uuid : "none"}-${preset ?? "none"}-${hdrFile}-${background}`;

  return (
    <canvas
      key={instanceKey}
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0 }}
    />
  );
}
