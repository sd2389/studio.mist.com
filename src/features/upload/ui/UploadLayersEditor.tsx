"use client";

import { Eye, EyeOff, Pencil, Check, X } from "lucide-react";
import { useState } from "react";
import type { LayerRow } from "@/lib/upload/layer-state";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type UploadLayersEditorProps = {
  layers: LayerRow[];
  onRename: (rawName: string, nextSlotId: string) => void;
  onToggleVisibility: (slotId: string, visible: boolean) => void;
};

export function UploadLayersEditor({
  layers,
  onRename,
  onToggleVisibility,
}: UploadLayersEditorProps) {
  const [editingRaw, setEditingRaw] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const startEdit = (layer: LayerRow) => {
    setEditingRaw(layer.rawName);
    setDraftName(layer.slotId);
  };

  const commitEdit = (rawName: string) => {
    const trimmed = draftName.trim();
    if (trimmed) onRename(rawName, trimmed);
    setEditingRaw(null);
    setDraftName("");
  };

  const cancelEdit = () => {
    setEditingRaw(null);
    setDraftName("");
  };

  if (layers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No layers detected. A default metal slot will be created on save.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {layers.map((layer) => {
        const isEditing = editingRaw === layer.rawName;
        return (
          <div
            key={layer.rawName}
            className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-2.5 py-2"
          >
            {isEditing ? (
              <>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="h-8 flex-1 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit(layer.rawName);
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={() => commitEdit(layer.rawName)}
                  aria-label="Save layer name"
                >
                  <Check className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={cancelEdit}
                  aria-label="Cancel rename"
                >
                  <X className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{layer.slotId}</p>
                  {layer.rawName !== layer.slotId ? (
                    <p className="truncate text-[11px] text-muted-foreground">from {layer.rawName}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  onClick={() => startEdit(layer)}
                  aria-label={`Rename ${layer.slotId}`}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn("size-8 shrink-0", !layer.visible && "text-muted-foreground")}
                  onClick={() => onToggleVisibility(layer.slotId, !layer.visible)}
                  aria-label={layer.visible ? `Hide ${layer.slotId}` : `Show ${layer.slotId}`}
                >
                  {layer.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </Button>
              </>
            )}
          </div>
        );
      })}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Rename layers to canonical slots (Metal 01, Gem 01, Heads) so materials bind correctly in
        the editor.
      </p>
    </div>
  );
}
