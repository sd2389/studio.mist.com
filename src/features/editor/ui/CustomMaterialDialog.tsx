"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mapCatalogGemToPreset, mapCatalogMetalToApply } from "@/lib/catalog/map-to-preset";
import type { GemItem, MetalItem } from "@/lib/catalog/types";
import { catalogFallbackColor } from "@/lib/catalog/swatch";
import { buildCustomGemParams, buildCustomMetalParams } from "@/lib/library/build-params";
import { createUserMaterial } from "@/lib/library/fetch-library";
import { customMaterialRef } from "@/lib/library/custom-material-ref";
import type { UserMaterialItem } from "@/lib/library/types";
import type { FinishId, MaterialPresetId } from "@/stores/material-preset-store";
import type { SlotMaterialRef } from "@/lib/library/custom-material-ref";

type CustomMaterialDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "metal" | "gem";
  catalogItems: Array<MetalItem | GemItem>;
  onApply: (preset: SlotMaterialRef, finish?: FinishId) => void;
  onApplyCustom?: (ref: SlotMaterialRef, finish?: FinishId) => void;
  onSaved?: (item: UserMaterialItem) => void;
};

function hexDistance(a: string, b: string): number {
  const parse = (hex: string) => {
    const normalized = hex.replace("#", "");
    if (normalized.length !== 6) return [128, 128, 128];
    return [
      Number.parseInt(normalized.slice(0, 2), 16),
      Number.parseInt(normalized.slice(2, 4), 16),
      Number.parseInt(normalized.slice(4, 6), 16),
    ];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return (ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2;
}

export function CustomMaterialDialog({
  open,
  onOpenChange,
  kind,
  catalogItems,
  onApply,
  onApplyCustom,
  onSaved,
}: CustomMaterialDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(kind === "metal" ? "#EDD09A" : "#FFFFFF");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nearest = useMemo(() => {
    if (catalogItems.length === 0) return null;
    let best = catalogItems[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const item of catalogItems) {
      const itemColor = catalogFallbackColor(item);
      const distance = hexDistance(color, itemColor);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }
    return best;
  }, [catalogItems, color]);

  const defaultName =
    name.trim() ||
    (nearest
      ? kind === "metal"
        ? `Custom ${nearest.label.split(" (")[0]}`
        : `Custom ${nearest.label}`
      : `Custom ${kind}`);

  const handleApply = () => {
    if (!nearest) return;
    if (kind === "metal") {
      const mapped = mapCatalogMetalToApply(nearest as MetalItem);
      onApply(mapped.preset, mapped.finish);
    } else {
      onApply(mapCatalogGemToPreset(nearest as GemItem));
    }
    onOpenChange(false);
    setName("");
    setError(null);
  };

  const handleSave = async (applyAfterSave: boolean) => {
    if (!nearest) return;
    setSaving(true);
    setError(null);
    try {
      const params =
        kind === "metal"
          ? buildCustomMetalParams(color, nearest as MetalItem)
          : buildCustomGemParams(color, nearest as GemItem);

      const item = await createUserMaterial({
        kind,
        label: defaultName,
        params,
        category: kind === "metal" ? (nearest as MetalItem).category : undefined,
        family: kind === "metal" ? (nearest as MetalItem).family : undefined,
        gem_family: kind === "gem" ? (nearest as GemItem).gem_family : undefined,
      });

      onSaved?.(item);

      if (applyAfterSave && onApplyCustom) {
        const ref = customMaterialRef(item.id);
        const finish =
          kind === "metal" && typeof params.finish === "string"
            ? (params.finish as FinishId)
            : undefined;
        onApplyCustom(ref, finish);
      }

      onOpenChange(false);
      setName("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save material");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-border bg-card">
        <DialogHeader>
          <DialogTitle>Create custom {kind} material</DialogTitle>
          <DialogDescription>
            Pick a color, save it to your library, and reuse it across models.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="custom-material-name">Name</Label>
            <Input
              id="custom-material-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={defaultName}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-material-color">Base color</Label>
            <div className="flex items-center gap-3">
              <input
                id="custom-material-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="size-10 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
              />
              <span className="text-xs text-muted-foreground">
                {nearest ? `Nearest match: ${nearest.label}` : "Loading catalog…"}
              </span>
            </div>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={handleApply} disabled={!nearest || saving}>
            Apply to layer (catalog match)
          </Button>
          <Button type="button" onClick={() => void handleSave(true)} disabled={!nearest || saving}>
            {saving ? "Saving…" : "Save & apply to layer"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="text-xs"
            onClick={() => void handleSave(false)}
            disabled={!nearest || saving}
          >
            Save to library only
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
