"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { convertUploadToGlb, inspectModelFromFile } from "@/lib/convert/to-glb";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";
import { useFixedClockWarmup } from "./useFixedClockWarmup";
import { ViewerCanvas } from "./ViewerCanvas";

const LIGHTING_IDS: readonly LightingPresetId[] = ["studio", "soft", "dark", "catalog", "dramatic"];

/** Frames drawn before a capture counts as settled: a render job's count, and the most `warmup` may ask for. */
const MAX_WARMUP_FRAMES = 60;

function clampWarmup(raw: string | null): number {
  const frames = Math.round(Number(raw));
  return Number.isFinite(frames) && frames > 0 ? Math.min(frames, MAX_WARMUP_FRAMES) : MAX_WARMUP_FRAMES;
}

function isLighting(v: string | null): v is LightingPresetId {
  return v !== null && (LIGHTING_IDS as readonly string[]).includes(v);
}

function reportReady() {
  window.__HARNESS_STATE__ = "ready";
}

/**
 * Deterministic render target for golden-image benchmarks (the render harness with no `mode`).
 * Not linked from any UI. A CAD `model` is converted for display first; the golden fixture
 * itself is made by the convert mode (scripts/golden/export-fixture.mjs).
 */
export function RenderHarness() {
  const params = useSearchParams();
  // A golden only has to match itself run after run, so it may draw fewer frames (`warmup`).
  const warmup = clampWarmup(params.get("warmup"));
  const lighting: LightingPresetId = isLighting(params.get("lighting")) ? (params.get("lighting") as LightingPresetId) : "studio";
  const preset = (params.get("preset") ?? "gold-18k-yellow") as MaterialPresetId;
  const size = Number(params.get("size") ?? 512);
  const modelPath = params.get("model") ?? "/test-fixtures/PDR-2413.glb";
  const isGlb = modelPath.endsWith(".glb") || modelPath.endsWith(".gltf");

  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const modelUrl = isGlb ? modelPath : convertedUrl;

  useEffect(() => {
    window.__HARNESS_STATE__ = "loading";

    // A GLB/GLTF static asset goes straight to the canvas; no conversion needed.
    if (isGlb) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;
    // Exercise the same CAD conversion used by the upload flow.
    (async () => {
      const res = await fetch(modelPath);
      if (!res.ok) throw new Error(`fetch ${modelPath}: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], modelPath.split("/").pop() ?? "model.3dm");
      const inspected = await inspectModelFromFile(file);
      const slots: Record<string, number> = {};
      inspected.loaded.root.traverse((object) => {
        if (!("isMesh" in object)) return;
        const slot = String(object.userData.devjewelsSlot ?? "unassigned");
        slots[slot] = (slots[slot] ?? 0) + 1;
      });
      console.info("[CAD inspection]", JSON.stringify(slots));
      const converted = await convertUploadToGlb(file, { generateThumbnail: false, preloaded: inspected.loaded });
      if (cancelled) return;

      objectUrl = URL.createObjectURL(converted.glb);
      setConvertedUrl(objectUrl);
    })().catch((e: unknown) => {
      if (!cancelled) window.__HARNESS_STATE__ = `error:${e instanceof Error ? e.message : String(e)}`;
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [modelPath, isGlb]);

  // The canvas keeps the last frame, so a capture depends on neither load speed nor when the
  // screenshot is taken.
  useFixedClockWarmup(modelUrl !== null, warmup, reportReady);

  return (
    <div style={{ width: size, height: size }} data-harness-canvas>
      {modelUrl ? (
        <ViewerCanvas modelUrl={modelUrl} preset={preset} autoRotate={false} lighting={lighting} frameloop="never" />
      ) : null}
    </div>
  );
}
