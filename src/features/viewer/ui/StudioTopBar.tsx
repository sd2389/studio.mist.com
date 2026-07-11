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
    <header className="relative flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#171614]/85 px-3 backdrop-blur-xl sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href="/dashboard"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-white/50 transition hover:bg-white/[0.06] hover:text-white"
          aria-label="Back to workshop"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white sm:text-[15px]">
            {sceneDisplayName(modelId)}
          </p>
          <p className="mt-0.5 truncate text-[9px] font-medium uppercase tracking-[0.13em] text-white/35">
            {preset} · {lighting}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <QualityMenu />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          onClick={savePreset}
        >
          <Save className="size-4" aria-hidden />
          <span className="hidden sm:inline">Save preset</span>
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
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
          className="absolute left-1/2 top-[4.5rem] z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#211f1b] px-3 py-1.5 text-xs text-white shadow-xl"
          role="status"
        >
          {toast}
        </p>
      ) : null}
    </header>
  );
}
