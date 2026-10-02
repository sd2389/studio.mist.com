"use client";

import Link from "next/link";
import { ChevronLeft, RotateCcw, Save, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buildEmbedUrl, resolveEmbedKey } from "@/lib/embed-settings";
import { sceneDisplayName } from "@/lib/scene-display-name";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { QualityMenu } from "./QualityMenu";

type StudioTopBarProps = {
  modelId: string;
  sku?: string | null;
  displayName?: string | null;
};

export function StudioTopBar({ modelId, sku, displayName }: StudioTopBarProps) {
  const preset = useMaterialPresetStore((s) => s.preset);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const [toast, setToast] = useState<string | null>(null);
  const canShare = Boolean(sku?.trim());

  function savePreset() {
    const { preset, lighting, finish, autoRotate, slotSelections, sceneSettings } = useMaterialPresetStore.getState();
    try {
      localStorage.setItem(`studio-scene-${modelId}`, JSON.stringify({
        version: 1, preset, lighting, finish, autoRotate, slotSelections, sceneSettings,
      }));
      setToast("Look saved on this device. Restore it anytime.");
    } catch {
      setToast("This browser could not save the look. Check available storage.");
    }
  }

  function restorePreset() {
    try {
      const raw = localStorage.getItem(`studio-scene-${modelId}`);
      if (!raw) { setToast("Save a look first, then restore it here."); return; }
      const look = JSON.parse(raw);
      if (look.version !== 1 || typeof look.preset !== "string" || typeof look.lighting !== "string" ||
          typeof look.finish !== "string" || typeof look.autoRotate !== "boolean" ||
          !look.slotSelections || !look.sceneSettings) throw new Error("Invalid saved look");
      useMaterialPresetStore.setState({
        preset: look.preset, lighting: look.lighting, finish: look.finish,
        autoRotate: look.autoRotate, slotSelections: look.slotSelections, sceneSettings: look.sceneSettings,
      });
      setToast("Saved look restored");
    } catch {
      setToast("This saved look could not be restored. Save a new look to replace it.");
    }
  }

  async function shareEmbed() {
    if (!canShare) return;
    const embedKey = resolveEmbedKey(sku, modelId);
    const url = buildEmbedUrl(window.location.origin, embedKey);
    try {
      await navigator.clipboard.writeText(url);
      setToast("Share link copied");
    } catch {
      setToast("Clipboard unavailable. Use the Export panel to copy your link.");
    }
  }

  return (
    <header className="relative z-50 flex h-[52px] shrink-0 items-center gap-2 border-b border-foreground/10 bg-background px-2 text-foreground sm:gap-3 sm:px-3">
      <Link
        href="/dashboard"
        className="grid size-8 shrink-0 place-items-center rounded-md text-foreground/55 transition hover:bg-foreground/[0.04] hover:text-foreground"
        aria-label="Back to workshop"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium tracking-tight text-foreground">
          {displayName || sceneDisplayName(modelId)}
        </p>
        <p className="truncate text-[10px] text-foreground/40">
          {preset} · {lighting}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <QualityMenu />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="inline-flex h-8 rounded-md border-foreground/15 bg-transparent px-2 font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/65 shadow-none hover:bg-surface hover:text-foreground"
          aria-label="Save look on this device"
          onClick={savePreset}
        >
          <Save className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Save look</span>
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={restorePreset} aria-label="Restore saved look" title="Restore saved look">
          <RotateCcw className="size-3.5" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="inline-flex h-8 rounded-md px-2 font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/65 hover:bg-foreground/[0.04] hover:text-foreground"
          aria-label="Copy share link"
          onClick={() => void shareEmbed()}
          disabled={!canShare}
          title={
            canShare
              ? "Copy embed URL"
              : "Publish or set a SKU before embedding"
          }
        >
          <Share2 className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
      {toast ? (
        <p
          className="absolute left-1/2 top-[calc(100%+8px)] z-50 -translate-x-1/2 rounded-md border border-foreground/10 bg-surface px-3 py-1.5 text-xs text-foreground shadow-sm"
          role="status"
        >
          {toast}
          <button type="button" className="ml-3 underline" onClick={() => setToast(null)} aria-label="Dismiss message">Dismiss</button>
        </p>
      ) : null}
    </header>
  );
}
