"use client";

import Link from "next/link";
import { LayoutDashboard, Save, Share2 } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sceneDisplayName } from "@/lib/scene-display-name";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { QualityMenu } from "./QualityMenu";

type StudioTopBarProps = {
  modelId: string;
};

export function StudioTopBar({ modelId }: StudioTopBarProps) {
  const preset = useMaterialPresetStore((s) => s.preset);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const [toast, setToast] = useState<string | null>(null);

  function savePreset() {
    const payload = { preset, lighting, savedAt: Date.now() };
    localStorage.setItem(`studio-scene-${modelId}`, JSON.stringify(payload));
    setToast("Preset saved locally");
    setTimeout(() => setToast(null), 2200);
  }

  async function shareEmbed() {
    const url = `${window.location.origin}/embed/${encodeURIComponent(modelId)}`;
    await navigator.clipboard.writeText(url);
    setToast("Embed URL copied");
    setTimeout(() => setToast(null), 2200);
  }

  return (
    <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 py-2.5 sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-foreground sm:text-lg">
          {sceneDisplayName(modelId)}
        </p>
        <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
          Viewer · {preset} · {lighting}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "hidden items-center gap-1.5 text-muted-foreground hover:text-foreground sm:inline-flex",
          )}
        >
          <LayoutDashboard className="size-4" aria-hidden />
          Dashboard
        </Link>
        <QualityMenu />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-border"
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
        >
          <Share2 className="size-4" aria-hidden />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
      {toast ? (
        <p
          className="absolute left-1/2 top-14 z-50 -translate-x-1/2 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground shadow-md"
          role="status"
        >
          {toast}
        </p>
      ) : null}
    </header>
  );
}
