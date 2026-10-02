"use client";

import { Trash2 } from "lucide-react";
import type { UserAssetItem } from "@/lib/library/types";

type UserBackgroundGridProps = {
  items: UserAssetItem[];
  selectedUrl?: string | null;
  onSelect: (asset: UserAssetItem) => void;
  onDelete: (asset: UserAssetItem) => void;
};

export function UserBackgroundGrid({ items, selectedUrl, onSelect, onDelete }: UserBackgroundGridProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Uploaded backgrounds are saved to your library and reusable across models.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((asset) => {
        const preview = asset.preview_url ?? asset.url;
        const selected = Boolean(preview && selectedUrl === preview);
        return (
          <div key={asset.id} className="relative">
            <button
              type="button"
              onClick={() => onSelect(asset)}
              className={`group flex w-full flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2 text-center transition-colors ${
                selected
                  ? "border-foreground/45 bg-card shadow-sm"
                  : "border-border/60 bg-card/50 hover:border-foreground/30 hover:bg-card"
              }`}
              title={asset.label}
            >
              <span
                className={`relative size-10 overflow-hidden rounded-md ${
                  selected ? "ring-2 ring-foreground/40 ring-offset-2 ring-offset-card" : ""
                }`}
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <span className="grid size-full place-items-center bg-muted text-[10px] text-muted-foreground">
                    ?
                  </span>
                )}
              </span>
              <span className="line-clamp-2 max-w-full text-[10px] font-medium leading-tight text-foreground/75">
                {asset.label}
              </span>
            </button>
            <button
              type="button"
              className="absolute right-0 top-0 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-destructive"
              aria-label={`Delete ${asset.label}`}
              onClick={() => void onDelete(asset)}
            >
              <Trash2 className="size-2.5" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
