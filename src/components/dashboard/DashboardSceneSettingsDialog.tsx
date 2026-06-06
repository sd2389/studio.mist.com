"use client";

import { Loader2, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { metadataFromScene } from "@/features/editor/ui/EditorSettingsTab";
import { updateScene, type Scene } from "@/features/scene";
import { UploadMetadataForm, type UploadMetadata } from "@/features/upload/ui/UploadMetadataForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sceneTitle } from "./scene-display";

type DashboardSceneSettingsDialogProps = {
  scene: Scene | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (sceneId: number, metadata: UploadMetadata) => void;
};

export function DashboardSceneSettingsDialog({
  scene,
  open,
  onOpenChange,
  onSaved,
}: DashboardSceneSettingsDialogProps) {
  const [metadata, setMetadata] = useState<UploadMetadata | null>(null);
  const [skuError, setSkuError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (scene) {
      setMetadata(metadataFromScene(scene));
      setSkuError(null);
      setStatus(null);
    }
  }, [scene]);

  async function handleUpdate() {
    if (!scene || !metadata) return;
    setBusy(true);
    setSkuError(null);
    setStatus(null);
    try {
      await updateScene(scene.id, {
        name: metadata.name.trim() || undefined,
        sku: metadata.sku.trim() || undefined,
        category: metadata.category || undefined,
        note: metadata.note.trim() || undefined,
      });
      onSaved(scene.id, metadata);
      setStatus("Settings updated");
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed";
      if (message.toLowerCase().includes("sku")) {
        setSkuError(message);
      } else {
        setStatus(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-4 text-primary" aria-hidden />
            Model settings
          </DialogTitle>
          <DialogDescription>
            {scene ? `Update metadata for ${sceneTitle(scene)}.` : "Edit model metadata."}
          </DialogDescription>
        </DialogHeader>

        {metadata ? (
          <UploadMetadataForm
            value={metadata}
            onChange={(patch) => setMetadata((prev) => (prev ? { ...prev, ...patch } : prev))}
            skuError={skuError}
          />
        ) : null}

        {status ? (
          <p className="text-xs text-muted-foreground" role="status">
            {status}
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleUpdate()} disabled={busy || !metadata}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
