"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ZOOM_PRESETS, zoomBy, zoomToFactor } from "@/stores/orbit-controls-store";
import { cn } from "@/lib/utils";

export function ZoomControls({ className }: { className?: string }) {
  return (
    <div
      className={
        "pointer-events-auto absolute bottom-4 right-4 z-30 flex items-center gap-1 rounded-full border border-border bg-card/95 p-1 shadow-md backdrop-blur " +
        (className ?? "")
      }
      role="toolbar"
      aria-label="Zoom controls"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => zoomBy(0.8)}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => zoomBy(1.25)}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => zoomToFactor(1)}
        aria-label="Fit to view"
        title="Fit to view"
      >
        <Maximize className="size-4" aria-hidden />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "ml-0.5 h-7 gap-1 px-2 text-xs",
          )}
          aria-label="Zoom presets"
        >
          Zoom
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-border bg-popover text-popover-foreground">
          {ZOOM_PRESETS.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => zoomToFactor(p.factor)}>
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
