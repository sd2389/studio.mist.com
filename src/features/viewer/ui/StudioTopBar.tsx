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
    <header className="relative z-50 grid h-[72px] shrink-0 grid-cols-[78px_1fr_auto] border-b border-black/10 bg-white/55 text-[#212121] backdrop-blur-2xl">
      <Link
        href="/dashboard"
        className="grid place-items-center border-r border-black/10 text-black"
        aria-label="Back to workshop"
      >
        <span className="size-2.5 rotate-45 border border-black" />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href="/dashboard"
          className="ml-4 grid size-8 shrink-0 place-items-center rounded-full border border-black/10 text-black/45 transition hover:bg-white/60 hover:text-black"
          aria-label="Back to workshop"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-black">
            {sceneDisplayName(modelId)}
          </p>
          <p className="mt-1 truncate text-[8px] font-medium uppercase tracking-[0.13em] text-black/35">
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
          className="rounded-full border-black/10 bg-white/35 text-[9px] uppercase tracking-[0.1em] text-black/60 hover:bg-white hover:text-black"
          onClick={savePreset}
        >
          <Save className="size-4" aria-hidden />
          <span className="hidden sm:inline">Save preset</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full text-[9px] uppercase tracking-[0.1em] text-black hover:bg-white/60"
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
          className="glass-panel absolute left-1/2 top-[4.8rem] z-50 -translate-x-1/2 rounded-full px-4 py-2 text-xs text-black"
          role="status"
        >
          {toast}
        </p>
      ) : null}
    </header>
  );
}
