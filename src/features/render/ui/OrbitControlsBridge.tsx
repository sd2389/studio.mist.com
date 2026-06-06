"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useOrbitControlsStore } from "@/stores/orbit-controls-store";

/** Bridges drei's `<OrbitControls makeDefault />` instance into the orbit-controls Zustand store. */
export function OrbitControlsBridge() {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const setControls = useOrbitControlsStore((s) => s.setControls);

  useEffect(() => {
    setControls(controls ?? null);
    return () => setControls(null);
  }, [controls, setControls]);

  return null;
}
