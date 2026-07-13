"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { updateScene } from "@/features/scene";
import { Button } from "@/components/ui/button";
import type { ProductSpecs } from "@/lib/product-specs/types";
import { MetalSpecsSection } from "./specs/MetalSpecsSection";
import { FinishSpecsSection } from "./specs/FinishSpecsSection";
import { StonesSpecsSection } from "./specs/StonesSpecsSection";
import { SettingSpecsSection } from "./specs/SettingSpecsSection";
import { SizingSpecsSection } from "./specs/SizingSpecsSection";

type EditorSpecsTabProps = {
  sceneId: number;
  initialSpecs: ProductSpecs;
  onSpecsSaved?: (specs: ProductSpecs) => void;
  onSuggestFromMaterials?: () => void;
};

export function EditorSpecsTab({
  sceneId,
  initialSpecs,
  onSpecsSaved,
  onSuggestFromMaterials,
}: EditorSpecsTabProps) {
  const [specs, setSpecs] = useState(initialSpecs);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSpecs(initialSpecs);
  }, [initialSpecs]);

  function patch(partial: Partial<ProductSpecs>) {
    setSpecs((prev) => ({ ...prev, ...partial }));
  }

  async function handleUpdate() {
    setBusy(true);
    setStatus(null);
    try {
      await updateScene(sceneId, { product_specs: specs });
      onSpecsSaved?.(specs);
      setStatus("Specs updated");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        <MetalSpecsSection value={specs} onChange={patch} />
        <FinishSpecsSection value={specs} onChange={patch} />
        <StonesSpecsSection value={specs} onChange={patch} />
        <SettingSpecsSection value={specs} onChange={patch} />
        <SizingSpecsSection value={specs} onChange={patch} />
      </div>
      <div className="shrink-0 space-y-2 border-t border-border p-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => onSuggestFromMaterials?.()}
          disabled={busy}
        >
          Suggest from materials
        </Button>
        <Button
          type="button"
          className="w-full"
          onClick={() => void handleUpdate()}
          disabled={busy}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Updating…
            </>
          ) : (
            "Update specs"
          )}
        </Button>
        {status ? (
          <p className="text-xs text-muted-foreground" role="status">
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}
