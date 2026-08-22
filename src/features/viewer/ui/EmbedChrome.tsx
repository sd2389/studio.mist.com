"use client";

import Link from "next/link";
import { Maximize2, Minimize2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmbedChromeProps = {
  modelId: string;
  editorHref?: string;
  displayName?: string;
  brandingText?: string | null;
  showTitle?: boolean;
  showStudioLink?: boolean;
};

export function EmbedChrome({
  modelId,
  editorHref,
  displayName,
  brandingText,
  showTitle = true,
  showStudioLink = false,
}: EmbedChromeProps) {
  const studioHref = editorHref ?? `/viewer/${encodeURIComponent(modelId)}`;
  const [fs, setFs] = useState(false);
  const title = brandingText?.trim() || (showTitle ? displayName || modelId : null);

  useEffect(() => {
    function onFs() {
      setFs(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFs = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="pointer-events-auto z-20 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-black/10 bg-[#F4F2EE] px-3 text-[#212121]">
      <div className="min-w-0">
        {title ? (
          <p className="truncate text-sm font-medium text-black">{title}</p>
        ) : (
          <p className="truncate text-sm font-medium text-black/45">Jewelry</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-black/45 hover:bg-black/[0.04] hover:text-black"
          onClick={() => void toggleFs()}
          aria-label={fs ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {fs ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
        {showStudioLink ? (
          <Link
            href={studioHref}
            aria-label="Open full studio"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-black/45 hover:bg-black/[0.04] hover:text-black",
            )}
          >
            <Sparkles className="size-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
