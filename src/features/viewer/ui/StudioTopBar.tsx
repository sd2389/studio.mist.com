"use client";

import Link from "next/link";
import { ChevronLeft, Save, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buildEmbedUrl, resolveEmbedKey } from "@/lib/embed-settings";
import { sceneDisplayName } from "@/lib/scene-display-name";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { QualityMenu } from "./QualityMenu";

type StudioTopBarProps = {
  modelId: string;
  sku?: string | null;
};

export function StudioTopBar({ modelId, sku }: StudioTopBarProps) {
  const preset = useMaterialPresetStore((s) => s.preset);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const [toast, setToast] = useState<string | null>(null);
  const canShare = Boolean(sku?.trim());

  function savePreset() {
    const payload = { preset, lighting, savedAt: Date.now() };
    localStorage.setItem(`studio-scene-${modelId}`, JSON.stringify(payload));
    setToast("Preset saved locally");
    setTimeout(() => setToast(null), 2200);
  }

  async function shareEmbed() {
    if (!canShare) return;
    const embedKey = resolveEmbedKey(sku, modelId);
    const url = buildEmbedUrl(window.location.origin, embedKey);
    await navigator.clipboard.writeText(url);
    setToast("Embed URL copied");
    setTimeout(() => setToast(null), 2200);
  }

  return (
    <header className="relative z-50 flex h-[52px] shrink-0 items-center gap-2 border-b border-black/10 bg-[#F4F2EE] px-2 text-[#212121] sm:gap-3 sm:px-3">
      <Link
        href="/dashboard"
        className="grid size-8 shrink-0 place-items-center rounded-md text-black/55 transition hover:bg-black/[0.04] hover:text-black"
        aria-label="Back to workshop"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium tracking-tight text-black">
          {sceneDisplayName(modelId)}
        </p>
        <p className="truncate text-[10px] text-black/40">
          {preset} · {lighting}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <QualityMenu />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-md border-black/15 bg-transparent px-2 text-[10px] font-medium uppercase tracking-[0.1em] text-black/65 shadow-none hover:bg-white hover:text-black"
          onClick={savePreset}
        >
          <Save className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Save preset</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-md px-2 text-[10px] font-medium uppercase tracking-[0.1em] text-black/65 hover:bg-black/[0.04] hover:text-black"
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
          className="absolute left-1/2 top-[calc(100%+8px)] z-50 -translate-x-1/2 rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs text-black shadow-sm"
          role="status"
        >
          {toast}
        </p>
      ) : null}
    </header>
  );
}
