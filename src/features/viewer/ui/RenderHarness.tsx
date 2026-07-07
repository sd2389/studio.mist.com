"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ViewerCanvas } from "@/features/viewer/ui/ViewerCanvas";
import { convertUploadToGlb } from "@/lib/convert/to-glb";
import type { LightingPresetId, MaterialPresetId } from "@/stores/material-preset-store";
import { jobEndpoints, isValidPayload } from "@/lib/golden/job-mode";
import { getPublicApiUrl } from "@/lib/api-url";
import { getHiresRefs } from "@/stores/hires-export-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import { renderAtResolution } from "@/lib/offscreen-render";

const LIGHTING_IDS: readonly LightingPresetId[] = ["studio", "soft", "dark", "catalog", "dramatic"];

declare global {
  interface Window {
    __HARNESS_STATE__?: string;
    __JOB_STATE__?: string;
  }
}

function isLighting(v: string | null): v is LightingPresetId {
  return v !== null && (LIGHTING_IDS as readonly string[]).includes(v);
}

/** Deterministic render target for golden-image benchmarks. Not linked from any UI. */
export function RenderHarness() {
  const params = useSearchParams();

  // Job mode params
  const jobId = params.get("job");
  const jobToken = params.get("token");
  const isJobMode = jobId !== null && jobToken !== null;

  // Golden / export mode params (ignored in job mode)
  const lighting: LightingPresetId = isLighting(params.get("lighting")) ? (params.get("lighting") as LightingPresetId) : "studio";
  const preset = (params.get("preset") ?? "gold-18k-yellow") as MaterialPresetId;
  const size = Number(params.get("size") ?? 512);
  const modelPath = params.get("model") ?? "/test-fixtures/PDR-2413.glb";
  const exportMode = params.get("export") === "1";
  const isGlb = modelPath.endsWith(".glb") || modelPath.endsWith(".gltf");

  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [jobLighting, setJobLighting] = useState<LightingPresetId>("studio");
  const [jobPreset, setJobPreset] = useState<MaterialPresetId>("gold-18k-yellow");
  const [jobPayloadDims, setJobPayloadDims] = useState<{ width: number; height: number } | null>(null);

  // Job mode: fetch payload and set up for rendering
  useEffect(() => {
    if (!isJobMode) return;

    window.__JOB_STATE__ = "rendering";

    const endpoints = jobEndpoints(getPublicApiUrl(), jobId!, jobToken!);

    async function runJob() {
      // 1. Fetch and validate payload
      const payloadRes = await fetch(endpoints.payload);
      if (!payloadRes.ok) throw new Error(`payload fetch: ${payloadRes.status}`);
      const raw: unknown = await payloadRes.json();
      if (!isValidPayload(raw)) throw new Error("invalid payload shape");

      // 2. Validate model URL extension
      if (!raw.model_url.endsWith(".glb") && !raw.model_url.endsWith(".gltf")) {
        throw new Error("model_url must end .glb or .gltf");
      }

      // 3. Set up canvas with payload settings
      const resolvedLighting: LightingPresetId = isLighting(raw.lighting) ? (raw.lighting as LightingPresetId) : "studio";
      const resolvedPreset = raw.preset as MaterialPresetId;
      setJobLighting(resolvedLighting);
      setJobPreset(resolvedPreset);
      setJobPayloadDims({ width: raw.width, height: raw.height });
      setModelUrl(raw.model_url);
    }

    runJob().catch(async (e: unknown) => {
      const message = e instanceof Error ? e.message : String(e);
      try {
        await fetch(endpoints.fail, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: message }),
        });
      } catch {
        // best-effort — ignore fail-post errors
      }
      window.__JOB_STATE__ = "error:" + message;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isJobMode, jobId, jobToken]);

  // Golden / export mode: only runs when NOT in job mode
  useEffect(() => {
    if (isJobMode) return;

    window.__HARNESS_STATE__ = "loading";

    // If the model is already a GLB/GLTF static asset, pass it directly — no conversion needed.
    // This avoids the blob URL extension problem (JewelryModel rejects blob: URLs).
    if (isGlb) {
      setModelUrl(modelPath);
      return;
    }

    // Non-GLB path: fetch + convert. Only export mode can consume the result —
    // view mode cannot mount a converted blob URL (see below).
    (async () => {
      const res = await fetch(modelPath);
      if (!res.ok) throw new Error(`fetch ${modelPath}: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], modelPath.split("/").pop() ?? "model.3dm");
      const converted = await convertUploadToGlb(file);
      // convertUploadToGlb returns ConvertToGlbResult where .glb is already a Blob
      const glbBlob = converted.glb;

      if (exportMode) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(glbBlob);
        a.download = "PDR-2413.glb";
        a.click();
        window.__HARNESS_STATE__ = "exported";
        return;
      }

      // View mode with a converted model: JewelryModel rejects blob: URLs
      // (they lack a file extension), so mounting the canvas would render an
      // error card while the frame counter still flagged "ready". Fail
      // explicitly instead and leave the canvas unmounted (modelUrl stays null).
      window.__HARNESS_STATE__ =
        "error:non-glb model cannot be viewed (blob URLs lack extensions); use a .glb model or export=1";
    })().catch((e: unknown) => {
      window.__HARNESS_STATE__ = `error:${e instanceof Error ? e.message : String(e)}`;
    });
  }, [isJobMode, modelPath, isGlb, exportMode]);

  // Ready signal + job render: fires after canvas is mounted and warm
  useEffect(() => {
    if (!modelUrl) return;

    let frames = 0;
    let raf = 0;

    const tick = () => {
      frames += 1;
      if (frames >= 60) {
        if (isJobMode && jobPayloadDims) {
          // Job mode: offscreen render + upload
          const endpoints = jobEndpoints(getPublicApiUrl(), jobId!, jobToken!);
          (async () => {
            const refs = getHiresRefs();
            if (!refs) throw new Error("hires refs unavailable");
            const blob = await renderAtResolution({
              ...refs,
              ...getRenderFidelity(),
              width: jobPayloadDims.width,
              height: jobPayloadDims.height,
              pixelRatio: 1,
            });
            const form = new FormData();
            form.append("file", blob, "render.png");
            const res = await fetch(endpoints.complete, { method: "POST", body: form });
            if (!res.ok) throw new Error(`complete: ${res.status}`);
            window.__JOB_STATE__ = "done";
          })().catch(async (e: unknown) => {
            const message = e instanceof Error ? e.message : String(e);
            try {
              await fetch(endpoints.fail, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ error: message }),
              });
            } catch {
              // best-effort
            }
            window.__JOB_STATE__ = "error:" + message;
          });
        } else {
          // Golden mode: signal ready
          window.__HARNESS_STATE__ = "ready";
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [modelUrl, isJobMode, jobPayloadDims, jobId, jobToken]);

  const activePreset = isJobMode ? jobPreset : preset;
  const activeLighting = isJobMode ? jobLighting : lighting;
  const activeSize = isJobMode && jobPayloadDims ? Math.max(jobPayloadDims.width, jobPayloadDims.height) : size;

  return (
    <div style={{ width: activeSize, height: activeSize }} data-harness-canvas>
      {modelUrl ? (
        <ViewerCanvas modelUrl={modelUrl} preset={activePreset} autoRotate={false} lighting={activeLighting} />
      ) : null}
    </div>
  );
}
