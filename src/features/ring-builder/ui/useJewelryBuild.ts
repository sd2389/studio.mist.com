"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JewelryDesign } from "@/lib/jewelry-cad";
import { BuildController, type BuildSnapshot } from "@/features/ring-builder/ui/build-controller";

export type { DesignBuild } from "@/features/ring-builder/ui/build-controller";

function createBuildWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../worker/build.worker.ts", import.meta.url));
  } catch {
    return null;
  }
}

/** Latest built version of `design`, produced off the render path by `BuildController`. */
export function useJewelryBuild(design: JewelryDesign) {
  const [snapshot, setSnapshot] = useState<BuildSnapshot>({ build: null, building: true, error: null });
  const controller = useRef<BuildController | null>(null);

  useEffect(() => {
    const c = new BuildController(setSnapshot, createBuildWorker);
    controller.current = c;
    return () => {
      c.dispose();
      controller.current = null;
    };
  }, []);

  useEffect(() => {
    controller.current?.setDesign(design);
  }, [design]);

  const buildSizesZip = useCallback(
    (name: string, onProgress?: (done: number, total: number) => void) =>
      controller.current?.sizesZip(name, onProgress) ?? Promise.reject(new Error("Designer is not ready")),
    [],
  );

  return { ...snapshot, buildSizesZip };
}
