"use client";

import { useEffect, useState } from "react";
import { advance } from "@react-three/fiber";
import { useSearchParams } from "next/navigation";
import { ViewerCanvas } from "@/features/viewer/ui/ViewerCanvas";
import { convertUploadToGlb, inspectModelFromFile } from "@/lib/convert/to-glb";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";
import { jobEndpoints, jobHeaders, isValidPayload } from "@/lib/golden/job-mode";
import { getPublicApiUrl } from "@/lib/api-url";
import { getHiresRefs } from "@/stores/hires-export-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import { renderAtResolution } from "@/lib/offscreen-render";

const LIGHTING_IDS: readonly LightingPresetId[] = ["studio", "soft", "dark", "catalog", "dramatic"];

declare global {
  interface Window {
    __HARNESS_STATE__?: string;
    __JOB_STATE__?: string;
    /** A render job's per-job token. The worker sets it before the page loads, so it is never in the URL. */
    __JOB_TOKEN__?: string;
  }
}

/** Frames a render job draws before it captures. */
const JOB_WARMUP_FRAMES = 60;

/** Clock step between golden frames: frame N is drawn at N / 60 s, whatever the wall clock says. */
const GOLDEN_FRAME_SECONDS = 1 / 60;

function clampWarmup(raw: string | null): number {
  const frames = Math.round(Number(raw));
  return Number.isFinite(frames) && frames > 0 ? Math.min(frames, JOB_WARMUP_FRAMES) : JOB_WARMUP_FRAMES;
}

function isLighting(v: string | null): v is LightingPresetId {
  return v !== null && (LIGHTING_IDS as readonly string[]).includes(v);
}

/** Best-effort: if this never lands, the worker reports the failure itself. */
async function reportJobFailure(failUrl: string, token: string, error: string): Promise<void> {
  try {
    await fetch(failUrl, {
      method: "POST",
      headers: jobHeaders(token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ error }),
    });
  } catch {
    // best-effort — ignore fail-post errors
  }
}

/** Deterministic render target for golden-image benchmarks. Not linked from any UI. */
export function RenderHarness() {
  const params = useSearchParams();

  // Job mode params (the job's token comes from window.__JOB_TOKEN__, never the URL)
  const jobId = params.get("job");
  const isJobMode = jobId !== null;
  // Frames drawn before the picture counts as settled. Jobs always take the full count; a golden
  // capture may ask for fewer (`warmup`), since it only has to match itself run after run.
  const warmup = isJobMode ? JOB_WARMUP_FRAMES : clampWarmup(params.get("warmup"));

  // Golden / export mode params (ignored in job mode)
  const lighting: LightingPresetId = isLighting(params.get("lighting")) ? (params.get("lighting") as LightingPresetId) : "studio";
  const preset = (params.get("preset") ?? "gold-18k-yellow") as MaterialPresetId;
  const size = Number(params.get("size") ?? 512);
  const modelPath = params.get("model") ?? "/test-fixtures/PDR-2413.glb";
  const exportMode = params.get("export") === "1";
  const isGlb = modelPath.endsWith(".glb") || modelPath.endsWith(".gltf");

  const [loadedModelUrl, setModelUrl] = useState<string | null>(null);
  const modelUrl = !isJobMode && isGlb ? modelPath : loadedModelUrl;
  const [jobLighting, setJobLighting] = useState<LightingPresetId>("studio");
  const [jobPreset, setJobPreset] = useState<MaterialPresetId>("gold-18k-yellow");
  const [jobOutput, setJobOutput] = useState<{ width: number; height: number; watermark: boolean } | null>(null);

  // Job mode: fetch payload and set up for rendering
  useEffect(() => {
    if (!isJobMode) return;

    window.__JOB_STATE__ = "rendering";

    const apiBase = getPublicApiUrl();
    if (!apiBase) {
      // Without an API base every fetch below would go relative to the Next.js
      // origin and hang the worker until its timeout. Fail fast.
      window.__JOB_STATE__ = "error:API base URL not configured (set NEXT_PUBLIC_API_URL)";
      return;
    }
    const token = window.__JOB_TOKEN__;
    if (!token) {
      // Every job endpoint refuses a call without the token. Fail fast here too.
      window.__JOB_STATE__ = "error:job token not set (the worker sets window.__JOB_TOKEN__)";
      return;
    }
    const endpoints = jobEndpoints(apiBase, jobId);

    const runJob = async () => {
      // 1. Fetch and validate payload
      const payloadRes = await fetch(endpoints.payload, { headers: jobHeaders(token) });
      if (!payloadRes.ok) throw new Error(`payload fetch: ${payloadRes.status}`);
      const raw: unknown = await payloadRes.json();
      if (!isValidPayload(raw)) throw new Error("invalid payload shape");

      // 2. Validate model URL extension on the pathname only — presigned
      // S3/R2 URLs carry query strings, so the raw string never ends in .glb.
      const modelPathname = new URL(raw.model_url, window.location.origin).pathname;
      if (!modelPathname.endsWith(".glb") && !modelPathname.endsWith(".gltf")) {
        throw new Error("model_url pathname must end .glb or .gltf");
      }

      // 3. Set up canvas with payload settings
      const resolvedLighting: LightingPresetId = isLighting(raw.lighting) ? (raw.lighting as LightingPresetId) : "studio";
      const resolvedPreset = raw.preset as MaterialPresetId;
      setJobLighting(resolvedLighting);
      setJobPreset(resolvedPreset);
      setJobOutput({ width: raw.width, height: raw.height, watermark: raw.watermark });
      setModelUrl(raw.model_url);
    };

    runJob().catch(async (e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      await reportJobFailure(endpoints.fail, token, message);
      window.__JOB_STATE__ = "error:" + message;
    });
  }, [isJobMode, jobId]);

  // Golden / export mode: only runs when NOT in job mode
  useEffect(() => {
    if (isJobMode) return;

    window.__HARNESS_STATE__ = "loading";

    // If the model is already a GLB/GLTF static asset, pass it directly — no conversion needed.
    // This avoids the blob URL extension problem (JewelryModel rejects blob: URLs).
    if (isGlb) {
      return;
    }

    let cancelled = false;
    let convertedUrl: string | undefined;
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
      // convertUploadToGlb returns ConvertToGlbResult where .glb is already a Blob
      const glbBlob = converted.glb;

      convertedUrl = URL.createObjectURL(glbBlob);
      if (exportMode) {
        const a = document.createElement("a");
        a.href = convertedUrl;
        a.download = converted.glbFilename;
        a.click();
        window.__HARNESS_STATE__ = "exported";
        return;
      }

      setModelUrl(convertedUrl);
    })().catch((e: unknown) => {
      if (!cancelled) window.__HARNESS_STATE__ = `error:${e instanceof Error ? e.message : String(e)}`;
    });
    return () => {
      cancelled = true;
      if (convertedUrl) URL.revokeObjectURL(convertedUrl);
    };
  }, [isJobMode, modelPath, isGlb, exportMode]);

  // Golden mode: once the scene has mounted (everything it suspends on, model and environments,
  // has loaded), draw exactly `warmup` frames on a fixed clock, then stop. The canvas keeps the
  // last frame, so the capture depends on neither load speed nor when the screenshot is taken.
  useEffect(() => {
    if (isJobMode || !modelUrl) return;

    let frames = 0;
    let raf = 0;

    const tick = () => {
      if (getHiresRefs()) {
        frames += 1;
        advance(frames * GOLDEN_FRAME_SECONDS);
        if (frames >= warmup) {
          window.__HARNESS_STATE__ = "ready";
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isJobMode, modelUrl, warmup]);

  // Job render: fires after canvas is mounted and warm
  useEffect(() => {
    if (!isJobMode || !modelUrl || !jobOutput) return;

    let frames = 0;
    let raf = 0;

    const tick = () => {
      frames += 1;
      if (frames >= warmup) {
        // Offscreen render + upload
        const endpoints = jobEndpoints(getPublicApiUrl(), jobId);
        const token = window.__JOB_TOKEN__ ?? "";
        (async () => {
          const refs = getHiresRefs();
          if (!refs) throw new Error("hires refs unavailable");
          const blob = await renderAtResolution({
            ...refs,
            ...getRenderFidelity(),
            width: jobOutput.width,
            height: jobOutput.height,
            pixelRatio: 1,
            // The API already checked the size against the owner's plan, and the payload says
            // whether that plan watermarks (render_jobs/service.py).
            limits: { maxEdge: Number.POSITIVE_INFINITY, watermark: jobOutput.watermark },
          });
          const form = new FormData();
          form.append("file", blob, "render.png");
          const res = await fetch(endpoints.complete, { method: "POST", body: form, headers: jobHeaders(token) });
          if (!res.ok) throw new Error(`complete: ${res.status}`);
          window.__JOB_STATE__ = "done";
        })().catch(async (e: unknown) => {
          const message = e instanceof Error ? e.message : String(e);
          await reportJobFailure(endpoints.fail, token, message);
          window.__JOB_STATE__ = "error:" + message;
        });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [modelUrl, isJobMode, jobOutput, jobId, warmup]);

  const activePreset = isJobMode ? jobPreset : preset;
  const activeLighting = isJobMode ? jobLighting : lighting;
  const activeSize = isJobMode && jobOutput ? Math.max(jobOutput.width, jobOutput.height) : size;

  return (
    <div style={{ width: activeSize, height: activeSize }} data-harness-canvas>
      {modelUrl ? (
        <ViewerCanvas
          modelUrl={modelUrl}
          preset={activePreset}
          autoRotate={false}
          lighting={activeLighting}
          frameloop={isJobMode ? "always" : "never"}
        />
      ) : null}
    </div>
  );
}
