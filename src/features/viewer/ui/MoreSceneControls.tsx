"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type {
  RenderQualityMode,
  SceneSettingBucketKey,
  SceneSettingsBuckets,
} from "@/lib/slot-materials/model-config";
import type { SourceCatalogItem } from "@/lib/source-catalog";
import { SCENE_BUCKET_ORDER } from "@/features/viewer/ui/studio-material-groups";

export type MoreSceneControlsProps = {
  qualityMode: RenderQualityMode;
  onQualityChange: (mode: RenderQualityMode) => void;
  envOptions: Record<SceneSettingBucketKey, SourceCatalogItem[]>;
  sceneSettings: SceneSettingsBuckets;
  onSceneSettingChange: (key: keyof SceneSettingsBuckets, value: string | null) => void;
  autoRotate: boolean;
  onAutoRotateChange: (value: boolean) => void;
};

export function MoreSceneControls({
  qualityMode,
  onQualityChange,
  envOptions,
  sceneSettings,
  onSceneSettingChange,
  autoRotate,
  onAutoRotateChange,
}: MoreSceneControlsProps) {
  return (
    <>
      <section>
        <h3 className="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">
          Render quality
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onQualityChange("standard")}
            className={cn(
              "rounded-xl border px-3 py-2 text-left transition-colors",
              qualityMode === "standard"
                ? "border-foreground/45 bg-background shadow-sm"
                : "border-border/60 bg-card/40 hover:border-foreground/25",
            )}
          >
            <p className="text-[11px] font-medium text-foreground">Standard</p>
            <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Fast preview
            </p>
          </button>
          <button
            type="button"
            onClick={() => onQualityChange("photometric")}
            className={cn(
              "rounded-xl border px-3 py-2 text-left transition-colors",
              qualityMode === "photometric"
                ? "border-foreground/45 bg-background shadow-sm"
                : "border-border/60 bg-card/40 hover:border-foreground/25",
            )}
          >
            <p className="text-[11px] font-medium text-foreground">Photometric</p>
            <p className="text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Catalog realism
            </p>
          </button>
        </div>
      </section>

      <section className="space-y-2.5">
        <h3 className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">
          Scene buckets
        </h3>
        <div className="space-y-2">
          {SCENE_BUCKET_ORDER.map((bucket) => {
            const bucketItems = envOptions[bucket] ?? [];
            return (
              <div key={bucket} className="rounded-xl border border-border/60 bg-card/60 p-2.5">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {bucket}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSceneSettingChange(bucket, null)}
                    className={cn(
                      "rounded-lg border px-2 py-1.5 text-left text-[10.5px] transition-colors",
                      sceneSettings[bucket] === null
                        ? "border-foreground/45 bg-background"
                        : "border-border/60 bg-card/40 hover:border-foreground/25",
                    )}
                  >
                    Default
                  </button>
                  {bucketItems.slice(0, 7).map((item) => {
                    const selected = sceneSettings[bucket] === item._id;
                    return (
                      <button
                        key={`${bucket}-${item._id}`}
                        type="button"
                        onClick={() => onSceneSettingChange(bucket, item._id)}
                        className={cn(
                          "rounded-lg border px-2 py-1.5 text-left text-[10.5px] transition-colors",
                          selected
                            ? "border-foreground/45 bg-background"
                            : "border-border/60 bg-card/40 hover:border-foreground/25",
                        )}
                        title={item.name}
                      >
                        <span className="line-clamp-1">{item.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2.5">
        <h3 className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">Camera</h3>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
          <Label htmlFor="auto-rotate" className="cursor-pointer text-sm text-foreground">
            Auto-rotate
          </Label>
          <Switch id="auto-rotate" checked={autoRotate} onCheckedChange={onAutoRotateChange} />
        </div>
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">
          Tip · Drag to orbit, scroll to zoom, or use the bottom-right toolbar for precise control.
        </p>
      </section>
    </>
  );
}
