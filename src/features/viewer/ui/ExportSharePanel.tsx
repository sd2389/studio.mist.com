"use client";

import { useState } from "react";
import {
  Camera,
  Download,
  Loader2,
  Maximize2,
  Sparkles,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { renderAtResolution } from "@/lib/offscreen-render";
import { captureFrameToDataUrl } from "@/stores/screenshot-store";
import { getHiresRefs } from "@/stores/hires-export-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

type ExportSharePanelProps = {
  modelId: string;
  onOpenAi: () => void;
  onOpenExport: () => void;
  onOpenHiResExport: () => void;
  onOpenVideo360: () => void;
  className?: string;
};

export function ExportSharePanel({
  modelId,
  onOpenAi,
  onOpenExport,
  onOpenHiResExport,
  onOpenVideo360,
  className,
}: ExportSharePanelProps) {
  const preset = useMaterialPresetStore((s) => s.preset);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleCapture() {
    const dataUrl = captureFrameToDataUrl();
    if (!dataUrl) {
      setStatus("Canvas not ready");
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/render/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, material: preset, lighting, image: dataUrl }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; key?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setStatus(json.key ? `Saved · ${json.key}` : "Saved");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function downloadPng() {
    const refs = getHiresRefs();
    if (!refs) {
      setStatus("Canvas not ready");
      return;
    }
    setStatus("Rendering…");
    try {
      const { exposure, postfxConfig } = getRenderFidelity();
      const { width, height } = refs.gl.domElement;
      const blob = await renderAtResolution({
        gl: refs.gl,
        scene: refs.scene,
        camera: refs.camera,
        width,
        height,
        pixelRatio: 2,
        exposure,
        postfxConfig,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${modelId}-render.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus("PNG downloaded");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Export failed");
    }
  }

  async function downloadSourceModel() {
    try {
      const res = await fetch(`/api/models/source/${encodeURIComponent(modelId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { error?: string; url?: string; model_key?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Source model unavailable");
      }
      const a = document.createElement("a");
      a.href = json.url;
      a.download = (json.model_key?.split("/").pop() ?? `${modelId}.glb`).replace(/[^\w.\-]+/g, "_");
      a.rel = "noopener";
      a.click();
      setStatus("Source model download started");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Source download failed");
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4",
        className,
      )}
    >
      <section className="space-y-2">
        <h3 className="font-display text-[13px] italic leading-none text-foreground/95">Capture</h3>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-3 border-border/60 bg-card/60"
          onClick={() => void handleCapture()}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Camera className="size-4" aria-hidden />
          )}
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm">Save render</span>
            <span className="text-[10px] text-muted-foreground">Pushes current frame to cloud</span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-3 border-border/60 bg-card/60"
          onClick={() => void downloadPng()}
        >
          <Download className="size-4" aria-hidden />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm">Download PNG</span>
            <span className="text-[10px] text-muted-foreground">Current frame · full fidelity</span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-3 border-border/60 bg-card/60"
          onClick={() => void downloadSourceModel()}
        >
          <Download className="size-4" aria-hidden />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm">Download source model</span>
            <span className="text-[10px] text-muted-foreground">Original uploaded GLB/3DM/STL</span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-3 border-border/60 bg-card/60"
          onClick={onOpenHiResExport}
        >
          <Download className="size-4" aria-hidden />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm">High-res PNG</span>
            <span className="text-[10px] text-muted-foreground">1080p · 4K · 8K offscreen</span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-3 border-border/60 bg-card/60"
          onClick={onOpenVideo360}
        >
          <Video className="size-4" aria-hidden />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm">360° turntable</span>
            <span className="text-[10px] text-muted-foreground">MP4 via Mediabunny + WebCodecs</span>
          </span>
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="font-display text-[13px] italic leading-none text-foreground/95">
          Share & marketing
        </h3>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-3 border-border/60 bg-card/60"
          onClick={onOpenAi}
        >
          <Sparkles className="size-4 text-primary" aria-hidden />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm">AI background</span>
            <span className="text-[10px] text-muted-foreground">Lifestyle scene compositing</span>
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-3 border-border/60 bg-card/60"
          onClick={onOpenExport}
        >
          <Maximize2 className="size-4" aria-hidden />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-sm">Embed code</span>
            <span className="text-[10px] text-muted-foreground">iframe for PDPs & decks</span>
          </span>
        </Button>
      </section>

      {status ? (
        <p className="text-[10.5px] leading-snug text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
