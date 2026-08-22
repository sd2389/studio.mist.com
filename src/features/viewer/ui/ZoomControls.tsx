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

const quietBtn =
  "size-8 rounded-full border border-black/10 bg-[#F4F2EE] text-black/65 shadow-none hover:bg-white hover:text-black";

type ZoomControlsProps = {
  className?: string;
  variant?: "studio" | "embed";
  /** Embed: 44×44 taps and no preset dropdown below 768px. */
  touchLayout?: boolean;
};

export function ZoomControls({
  className,
  variant = "studio",
  touchLayout = false,
}: ZoomControlsProps) {
  const tapClass = touchLayout ? cn(quietBtn, "size-11! md:size-8!") : quietBtn;

  if (variant === "embed") {
    return (
      <div
        className={cn(
          "pointer-events-auto absolute bottom-4 right-4 z-30 flex flex-col gap-1.5",
          className,
        )}
        role="toolbar"
        aria-label="Zoom controls"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={tapClass}
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
          className={tapClass}
          onClick={() => zoomBy(1.25)}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus className="size-4" aria-hidden />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "h-8 rounded-full border border-black/10 bg-[#F4F2EE] px-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-black/65 shadow-none hover:bg-white hover:text-black",
              touchLayout && "hidden md:inline-flex",
            )}
            aria-label="Zoom presets"
          >
            Zoom
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-black/10 bg-white text-black">
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

  return (
    <div
      className={cn(
        "pointer-events-auto absolute bottom-4 right-4 z-30 flex items-center gap-0.5",
        className,
      )}
      role="toolbar"
      aria-label="Zoom controls"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={quietBtn}
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
        className={quietBtn}
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
        className={quietBtn}
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
            "ml-0.5 h-8 rounded-full border border-black/10 bg-[#F4F2EE] px-2.5 text-[10px] font-medium uppercase tracking-[0.1em] text-black/65 shadow-none hover:bg-white hover:text-black",
          )}
          aria-label="Zoom presets"
        >
          Zoom
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-black/10 bg-white text-black">
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
