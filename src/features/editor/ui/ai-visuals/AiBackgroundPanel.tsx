"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AI_SHOOT_PRESETS } from "@/lib/ai-image-presets";
import { cn } from "@/lib/utils";

export type BackgroundKind = "shoot" | "custom";

type AiBackgroundPanelProps = {
  backgroundKind: BackgroundKind;
  onBackgroundKindChange: (kind: BackgroundKind) => void;
  presetIdx: number;
  onPresetIdxChange: (idx: number) => void;
  customPrompt: string;
  onCustomPromptChange: (value: string) => void;
};

export function AiBackgroundPanel({
  backgroundKind,
  onBackgroundKindChange,
  presetIdx,
  onPresetIdxChange,
  customPrompt,
  onCustomPromptChange,
}: AiBackgroundPanelProps) {
  const selectedPreset = AI_SHOOT_PRESETS[presetIdx] ?? AI_SHOOT_PRESETS[0]!;

  return (
    <>
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Background type
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onBackgroundKindChange("shoot")}
            className={cn(
              "rounded-lg border px-2 py-2 text-left transition-colors",
              backgroundKind === "shoot"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            <p className="text-sm font-medium">Shoot</p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              Preset studio and lifestyle scenes.
            </p>
          </button>
          <button
            type="button"
            onClick={() => onBackgroundKindChange("custom")}
            className={cn(
              "rounded-lg border px-2 py-2 text-left transition-colors",
              backgroundKind === "custom"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            <p className="text-sm font-medium">Custom</p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              Describe your own background or scene.
            </p>
          </button>
        </div>
      </div>

      {backgroundKind === "shoot" ? (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Scene preset
          </p>
          <div className="relative overflow-hidden rounded-xl border border-border">
            <div
              className={cn(
                "flex aspect-video items-end bg-gradient-to-br p-4",
                selectedPreset.gradient,
              )}
            >
              <div>
                <p className="text-sm font-medium text-foreground/90 drop-shadow-sm">
                  {selectedPreset.label}
                </p>
                <p className="mt-1 line-clamp-2 text-[10px] text-foreground/70">
                  {selectedPreset.prompt}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-muted/50 px-2 py-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  onPresetIdxChange(
                    (presetIdx - 1 + AI_SHOOT_PRESETS.length) % AI_SHOOT_PRESETS.length,
                  )
                }
                aria-label="Previous preset"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {presetIdx + 1} / {AI_SHOOT_PRESETS.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onPresetIdxChange((presetIdx + 1) % AI_SHOOT_PRESETS.length)}
                aria-label="Next preset"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {AI_SHOOT_PRESETS.map((preset, index) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPresetIdxChange(index)}
                className={cn(
                  "rounded-md border p-1 text-left transition-colors",
                  presetIdx === index
                    ? "border-primary ring-1 ring-primary/30"
                    : "border-border hover:border-muted-foreground/40",
                )}
                title={preset.label}
              >
                <div className={cn("aspect-square rounded bg-gradient-to-br", preset.gradient)} />
                <p className="mt-1 truncate text-[9px] text-muted-foreground">{preset.label}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="ai-custom-prompt" className="text-muted-foreground">
            Prompt
          </Label>
          <Textarea
            id="ai-custom-prompt"
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            rows={4}
            className="resize-none border-border bg-background text-sm"
            placeholder="Describe the scene…"
          />
        </div>
      )}
    </>
  );
}
