"use client";

import { AI_MODEL_VARIANTS, type AiModelVariant } from "@/lib/ai-image-presets";
import { cn } from "@/lib/utils";

type AiModelPanelProps = {
  modelVariant: AiModelVariant;
  onModelVariantChange: (variant: AiModelVariant) => void;
};

export function AiModelPanel({ modelVariant, onModelVariantChange }: AiModelPanelProps) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Placement
      </p>
      <div className="grid grid-cols-3 gap-2">
        {AI_MODEL_VARIANTS.map((variant) => (
          <button
            key={variant.id}
            type="button"
            onClick={() => onModelVariantChange(variant.id)}
            className={cn(
              "rounded-lg border px-2 py-2 text-left transition-colors",
              modelVariant === variant.id
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            <p className="text-sm font-medium">{variant.label}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{variant.description}</p>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Provider: stub by default. Set{" "}
        <code className="rounded bg-muted px-1 text-[10px]">AI_ON_MODEL_PROVIDER=replicate</code> +{" "}
        <code className="rounded bg-muted px-1 text-[10px]">REPLICATE_API_TOKEN</code> for hosted
        on-model shots.
      </p>
    </div>
  );
}
