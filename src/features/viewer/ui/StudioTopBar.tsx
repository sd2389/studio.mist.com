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
    <header className="relative z-50 grid h-[68px] shrink-0 grid-cols-[78px_1fr_auto] border-b border-white/20 bg-[#0b0b0a]/90 backdrop-blur-xl">
      <Link
        href="/dashboard"
        className="grid place-items-center border-r border-white/20 text-white"
        aria-label="Back to workshop"
      >
        <span className="size-2.5 bg-[#ef5b2a]" />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href="/dashboard"
          className="ml-4 grid size-8 shrink-0 place-items-center border border-white/20 text-white/50 transition hover:bg-white/10 hover:text-white"
          aria-label="Back to workshop"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-black uppercase tracking-[0.14em] text-white">
            {sceneDisplayName(modelId)}
          </p>
          <p className="mt-1 truncate text-[8px] font-medium uppercase tracking-[0.13em] text-white/35">
            {preset} · {lighting}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 px-4 sm:gap-2">
        <QualityMenu />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-none border-white/20 bg-transparent text-[9px] uppercase tracking-[0.12em] text-white/70 hover:bg-white/10 hover:text-white"
          onClick={savePreset}
        >
          <Save className="size-4" aria-hidden />
          <span className="hidden sm:inline">Save preset</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-none text-[9px] uppercase tracking-[0.12em] text-white hover:bg-white/10"
          onClick={() => void shareEmbed()}
          disabled={!canShare}
          title={
            canShare
              ? "Copy embed URL"
              : "Publish or set a SKU before embedding"
          }
        >
          <Share2 className="size-4" aria-hidden />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
      {toast ? (
        <p
          className="absolute left-1/2 top-[4.5rem] z-50 -translate-x-1/2 border border-white/20 bg-[#10100f] px-3 py-1.5 text-xs text-white shadow-xl"
          role="status"
        >
          {toast}
        </p>
      ) : null}
    </header>
  );
}
