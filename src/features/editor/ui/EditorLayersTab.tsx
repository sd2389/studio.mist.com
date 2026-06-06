"use client";

import { Eye, EyeOff } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { applyLayerVisibility } from "@/lib/upload/layer-state";
import { buildEditorLayerRows } from "@/lib/upload/editor-layer-rows";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { cn } from "@/lib/utils";

type EditorLayersTabProps = {
  modelConfig: PersistedModelConfig;
  onModelConfigChange: (config: PersistedModelConfig) => void;
  activeSlot: string | null;
  onActiveSlotChange: (slotId: string) => void;
};

export function EditorLayersTab({
  modelConfig,
  onModelConfigChange,
  activeSlot,
  onActiveSlotChange,
}: EditorLayersTabProps) {
  const layers = useMemo(() => buildEditorLayerRows(modelConfig), [modelConfig]);

  const handleToggleVisibility = (slotId: string, visible: boolean) => {
    onModelConfigChange(applyLayerVisibility(modelConfig, slotId, visible));
  };

  if (layers.length === 0) {
    return (
      <div className="px-4 py-4">
        <p className="text-sm text-muted-foreground">No layers found for this model.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Layers</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Select a layer to apply materials. Toggle visibility with the eye icon.
        </p>
      </div>

      <div className="space-y-2">
        {layers.map((layer) => {
          const isActive = activeSlot === layer.slotId;
          return (
            <div
              key={layer.slotId}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                isActive
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/60 bg-background/70",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onActiveSlotChange(layer.slotId)}
              >
                <p className="truncate text-sm font-medium text-foreground">{layer.slotId}</p>
                {layer.rawName !== layer.slotId ? (
                  <p className="truncate text-[11px] text-muted-foreground">from {layer.rawName}</p>
                ) : null}
              </button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn("size-8 shrink-0", !layer.visible && "text-muted-foreground")}
                onClick={() => handleToggleVisibility(layer.slotId, !layer.visible)}
                aria-label={layer.visible ? `Hide ${layer.slotId}` : `Show ${layer.slotId}`}
              >
                {layer.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Rename layers on the upload page before saving. Material tabs will apply to the
        active layer.
      </p>
    </div>
  );
}
