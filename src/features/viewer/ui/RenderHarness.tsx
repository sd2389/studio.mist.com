"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ViewerCanvas } from "@/features/viewer/ui/ViewerCanvas";
import { convertUploadToGlb } from "@/lib/convert/to-glb";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";

const LIGHTING_IDS: readonly LightingPresetId[] = ["studio", "soft", "dark", "catalog", "dramatic"];

declare global {
  interface Window {
    __HARNESS_STATE__?: string;
  }
}

function isLighting(v: string | null): v is LightingPresetId {
  return v !== null && (LIGHTING_IDS as readonly string[]).includes(v);
}

/** Deterministic render target for golden-image benchmarks. Not linked from any UI. */
export function RenderHarness() {
  const params = useSearchParams();
  const lighting: LightingPresetId = isLighting(params.get("lighting")) ? (params.get("lighting") as LightingPresetId) : "studio";
  const preset = (params.get("preset") ?? "gold-18k-yellow") as MaterialPresetId;
  const size = Number(params.get("size") ?? 512);
  const modelPath = params.get("model") ?? "/test-fixtures/PDR-2413.3dm";
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    window.__HARNESS_STATE__ = "loading";
    (async () => {
      const res = await fetch(modelPath);
      if (!res.ok) throw new Error(`fetch ${modelPath}: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], modelPath.split("/").pop() ?? "model.3dm");
      const converted = await convertUploadToGlb(file);
      // convertUploadToGlb returns ConvertToGlbResult where .glb is already a Blob
      const glbBlob = converted.glb;
      objectUrl = URL.createObjectURL(glbBlob);
      setModelUrl(objectUrl);
    })().catch((e: unknown) => {
      window.__HARNESS_STATE__ = `error:${e instanceof Error ? e.message : String(e)}`;
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [modelPath]);

  useEffect(() => {
    if (!modelUrl) return;
    // Give the canvas frames to load HDRI + compile shaders before flagging ready.
    let frames = 0;
    let raf = 0;
    const tick = () => {
      frames += 1;
      if (frames >= 60) {
        window.__HARNESS_STATE__ = "ready";
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [modelUrl]);

  return (
    <div style={{ width: size, height: size }} data-harness-canvas>
      {modelUrl ? (
        <ViewerCanvas modelUrl={modelUrl} preset={preset} autoRotate={false} lighting={lighting} />
      ) : null}
    </div>
  );
}
