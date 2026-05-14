"use client";

import Link from "next/link";
import { Maximize2, Minimize2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sceneDisplayName } from "@/lib/scene-display-name";

type EmbedChromeProps = {
  modelId: string;
};

export function EmbedChrome({ modelId }: EmbedChromeProps) {
  const [fs, setFs] = useState(false);

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
    <div className="pointer-events-auto absolute left-0 right-0 top-0 z-20 flex h-12 items-center justify-between gap-2 border-b border-border bg-card px-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {sceneDisplayName(modelId)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => void toggleFs()}
          aria-label={fs ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {fs ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
        <Link
          href={`/viewer/${encodeURIComponent(modelId)}`}
          aria-label="Open full studio"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "text-muted-foreground hover:text-foreground",
          )}
        >
          <Sparkles className="size-4" />
        </Link>
      </div>
    </div>
  );
}
