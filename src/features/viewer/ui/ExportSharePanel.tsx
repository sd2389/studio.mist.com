"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Camera,
  Download,
  Link2,
  Loader2,
  Sparkles,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CampaignPackLauncher,
  ExportJobsPanel,
  ExportPlanNote,
  loadExportPlan,
  RenderJobError,
  useExportPlan,
  useServerExports,
  type RenderJob,
} from "@/features/render";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { readViewportBackdrop } from "@/lib/export-backdrop";
import { pixelRatioWithinLimits } from "@/lib/export-limits";
import { cn } from "@/lib/utils";
import { renderAtResolution } from "@/lib/offscreen-render";
import { captureFrameToDataUrl } from "@/stores/screenshot-store";
import { getHiresRefs } from "@/stores/hires-export-store";
import { getRenderFidelity } from "@/stores/render-fidelity-store";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { useViewExports } from "./useViewExports";

type ExportSharePanelProps = {
  modelId: string;
  /** Scene SKU — Share/Embed stays gated until a non-empty SKU is set. */
  sku?: string | null;
  /** Scene name for export file names. */
  displayName?: string | null;
  /** Exact slot tokens, so pack metal re-skins match the studio's slot detection. */
  modelConfig?: PersistedModelConfig;
  onOpenAi: () => void;
  onOpenExport: () => void;
  onOpenHiResExport: () => void;
  onOpenVideo360: () => void;
  className?: string;
};

/** Embed requires a real SKU; viewer-id fallbacks must not unlock copy/share. */
function canOpenEmbed(sku: string | null | undefined): boolean {
  return Boolean(sku?.trim());
}

export function ExportSharePanel({
  modelId,
  sku,
  displayName,
  modelConfig,
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
  const exportPlan = useExportPlan();
  const embedReady = canOpenEmbed(sku);
  // While server exports are on, the still renders on the server and the thumbnail comes from the
  // view (ADR 0005); else both work as they always have. Until the flag is read, neither starts.
  const serverExports = useServerExports();
  const view = useViewExports(modelId, setStatus);

  async function handleCapture() {
    setSaving(true);
    setStatus(null);
    try {
      // An export like the others: within the plan's cap, watermarked on Free.
      const dataUrl = captureFrameToDataUrl(await loadExportPlan());
      if (!dataUrl) {
        setStatus("Canvas not ready");
        return;
      }
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
      const plan = await loadExportPlan();
      const { exposure, postfxConfig } = getRenderFidelity();
      const { width, height } = refs.gl.domElement;
      const blob = await renderAtResolution({
        gl: refs.gl,
        scene: refs.scene,
        camera: refs.camera,
        width,
        height,
        // Twice the canvas, within the plan's cap (Free: 4096 px on the longest side).
        pixelRatio: pixelRatioWithinLimits(plan, width, height, 2),
        exposure,
        postfxConfig,
        backdrop: readViewportBackdrop(refs.gl.domElement),
        limits: plan,
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

  function handleOpenEmbed() {
    if (!embedReady) return;
    setStatus(null);
    onOpenExport();
  }

  const spinner = <Loader2 className="size-4 animate-spin" aria-hidden />;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4",
        className,
      )}
    >
      <section className="space-y-2">
        <h3 className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">
          Export & share
        </h3>
        <ExportPlanNote plan={exportPlan} />
        <CampaignPackLauncher modelId={modelId} sku={sku} name={displayName} modelConfig={modelConfig} />
        <ExportActionButton
          icon={saving || view.settingThumbnail ? spinner : <Camera className="size-4" aria-hidden />}
          {...(serverExports
            ? { title: "Set as thumbnail", hint: "Current view · up to 1024 px · free", onClick: () => void view.setThumbnail() }
            : { title: "Capture still", hint: "Pushes current frame to cloud", onClick: () => void handleCapture() })}
          disabled={saving || view.settingThumbnail || serverExports === null}
        />
        <ExportActionButton
          icon={<Download className="size-4" aria-hidden />}
          title="Hi-res PNG"
          hint={serverExports ? "HD · 2K · 4K · 8K on our servers" : "HD · 2K · 4K · 8K offscreen"}
          onClick={onOpenHiResExport}
        />
        <ExportActionButton
          icon={<Link2 className="size-4" aria-hidden />}
          title="Share link / Embed snippet"
          hint="iframe for PDPs & decks"
          onClick={handleOpenEmbed}
          disabled={!embedReady}
        />
        {!embedReady ? (
          <p className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
            Publish or set a SKU before embedding
          </p>
        ) : null}
        <ExportActionButton
          icon={<Video className="size-4" aria-hidden />}
          title="360° turntable"
          hint="MP4 via Mediabunny + WebCodecs"
          onClick={onOpenVideo360}
        />
        <ExportActionButton
          icon={<Sparkles className="size-4 text-primary" aria-hidden />}
          title="AI Visuals"
          hint="Lifestyle scene compositing"
          onClick={onOpenAi}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">
          Downloads
        </h3>
        <ExportActionButton
          icon={view.quickStills.starting ? spinner : <Download className="size-4" aria-hidden />}
          {...(serverExports
            ? { title: "Quick still", hint: "Current view · 2048 px · 1 credit", onClick: () => void view.quickStill() }
            : { title: "Download PNG", hint: "Current frame · full fidelity", onClick: () => void downloadPng() })}
          disabled={serverExports === null || view.quickStills.starting}
        />
        <RenderJobError error={view.quickStills.error} className="text-[10.5px]" />
        <ExportActionButton
          icon={<Download className="size-4" aria-hidden />}
          title="Download source model"
          hint="The converted GLB"
          onClick={() => void downloadSourceModel()}
        />
      </section>

      {serverExports && view.exportScene ? (
        <SceneExports sceneId={view.exportScene.sceneId} started={view.quickStills.jobs} />
      ) : null}

      {status ? (
        <p className="text-[10.5px] leading-snug text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

/** The scene's server exports, newest first, with the Quick stills started here on top. */
function SceneExports({ sceneId, started }: { sceneId: number; started: RenderJob[] }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">Exports</h3>
        <Link href="/exports" className="text-[10.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          All exports
        </Link>
      </div>
      <ExportJobsPanel sceneId={sceneId} started={started} />
    </section>
  );
}

type ExportActionButtonProps = {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
};

/** A full-width outline button: icon, then a title over a one-line hint. */
function ExportActionButton({ icon, title, hint, onClick, disabled }: ExportActionButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full justify-start gap-3 border-border/60 bg-card/60"
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span className="flex flex-col items-start leading-tight">
        <span className="text-sm">{title}</span>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </span>
    </Button>
  );
}
