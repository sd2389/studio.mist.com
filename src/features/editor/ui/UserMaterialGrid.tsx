"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { catalogFallbackColor } from "@/lib/catalog/swatch";
import type { CatalogItem } from "@/lib/catalog/types";
import { customMaterialRef } from "@/lib/library/custom-material-ref";
import { userMaterialAsCatalogItem } from "@/lib/library/create-material-from-params";
import { deleteUserMaterial } from "@/lib/library/fetch-library";
import type { UserMaterialItem } from "@/lib/library/types";
import { CatalogSwatchTile } from "./CatalogSwatchTile";

type UserMaterialGridProps = {
  items: UserMaterialItem[];
  selectedRef?: string | null;
  gemShape?: boolean;
  onSelect: (item: UserMaterialItem) => void;
  onDelete?: (item: UserMaterialItem) => void;
};

export function UserMaterialGrid({
  items,
  selectedRef,
  gemShape = false,
  onSelect,
  onDelete,
}: UserMaterialGridProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Materials you save will appear here and sync across all your models.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => {
        const catalogItem = userMaterialAsCatalogItem(item) as CatalogItem;
        const selected = selectedRef === customMaterialRef(item.id);
        return (
          <div key={item.id} className="relative">
            <CatalogSwatchTile
              item={catalogItem}
              gemShape={gemShape}
              selected={selected}
              onClick={() => onSelect(item)}
            />
            {onDelete ? (
              <button
                type="button"
                className="absolute right-0 top-0 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-destructive"
                aria-label={`Delete ${item.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void onDelete(item);
                }}
              >
                <Trash2 className="size-2.5" aria-hidden />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export async function deleteUserMaterialItem(item: UserMaterialItem): Promise<void> {
  await deleteUserMaterial(item.id);
}

export function userMaterialPreviewColor(item: UserMaterialItem): string {
  return catalogFallbackColor(userMaterialAsCatalogItem(item) as CatalogItem);
}
