"use client";

import { Download, ImageIcon, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { updateScene } from "@/features/scene";
import { VariantManager } from "@/features/variants";
import type { ModelVariant } from "@/lib/variants/types";
import { UploadMetadataForm, type UploadMetadata } from "@/features/upload/ui/UploadMetadataForm";
import { Button } from "@/components/ui/button";
import { DEFAULT_JEWELRY_CATEGORY } from "@/lib/upload/categories";
import { captureFrameToDataUrl } from "@/stores/screenshot-store";
import type { MaterialPresetId, LightingPresetId } from "@/stores/material-preset-store";

type EditorSettingsTabProps = {
  sceneId: number;
  viewerId: string;
  initialMetadata: UploadMetadata;
  preset: MaterialPresetId;
  lighting: LightingPresetId;
  onMetadataSaved?: (metadata: UploadMetadata) => void;
  variantItems?: ModelVariant[];
  activeVariantId?: string | null;
  canAddVariant?: boolean;
  onSaveVariant?: () => void;
  onUpdateActiveVariant?: () => boolean;
  onSwitchVariant?: (variantId: string | null) => void;
  onRenameVariant?: (variantId: string, name: string) => void;
  onDeleteVariant?: (variantId: string) => void;
};

export function EditorSettingsTab({
  sceneId,
  viewerId,
  initialMetadata,
  preset,
  lighting,
  onMetadataSaved,
  variantItems = [],
  activeVariantId = null,
  canAddVariant = true,
  onSaveVariant,
  onUpdateActiveVariant,
  onSwitchVariant,
  onRenameVariant,
  onDeleteVariant,
}: EditorSettingsTabProps) {
  const [metadata, setMetadata] = useState<UploadMetadata>(initialMetadata);
  const [skuError, setSkuError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"update" | "thumbnail" | "download" | null>(null);

  useEffect(() => {
    setMetadata(initialMetadata);
  }, [initialMetadata]);

  async function handleUpdate() {
    setBusy("update");
    setSkuError(null);
    setStatus(null);
    try {
      await updateScene(sceneId, {
        name: metadata.name.trim() || undefined,
        sku: metadata.sku.trim() || undefined,
        category: metadata.category || undefined,
        note: metadata.note.trim() || undefined,
      });
      onMetadataSaved?.(metadata);
      setStatus("Settings updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed";
      if (message.toLowerCase().includes("sku")) {
        setSkuError(message);
      } else {
        setStatus(message);
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdateThumbnail() {
    const dataUrl = captureFrameToDataUrl();
    if (!dataUrl) {
      setStatus("Canvas not ready");
      return;
    }
    setBusy("thumbnail");
    setStatus(null);
    try {
      const res = await fetch("/api/render/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: viewerId,
          material: preset,
          lighting,
          image: dataUrl,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; key?: string };
      if (!res.ok) throw new Error(json.error ?? "Thumbnail update failed");
      setStatus(json.key ? `Thumbnail updated · ${json.key}` : "Thumbnail updated");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Thumbnail update failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDownloadModel() {
    setBusy("download");
    setStatus(null);
    try {
      const res = await fetch(`/api/models/source/${encodeURIComponent(viewerId)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { error?: string; url?: string; model_key?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Model download unavailable");
      }
      const a = document.createElement("a");
      a.href = json.url;
      a.download = (json.model_key?.split("/").pop() ?? `${viewerId}.glb`).replace(/[^\w.\-]+/g, "_");
      a.rel = "noopener";
      a.click();
      setStatus("Download started");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-4 py-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Settings</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Model metadata and file actions.
        </p>
      </div>

      <UploadMetadataForm
        value={metadata}
        onChange={(patch) => setMetadata((prev) => ({ ...prev, ...patch }))}
        skuError={skuError}
      />

      {onSaveVariant && onSwitchVariant && onRenameVariant && onDeleteVariant && onUpdateActiveVariant ? (
        <VariantManager
          items={variantItems}
          activeVariantId={activeVariantId}
          canAdd={canAddVariant}
          onSave={onSaveVariant}
          onUpdateActive={onUpdateActiveVariant}
          onSwitch={onSwitchVariant}
          onRename={onRenameVariant}
          onDelete={onDeleteVariant}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          onClick={() => void handleUpdate()}
          disabled={busy !== null}
        >
          {busy === "update" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Update
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleUpdateThumbnail()}
          disabled={busy !== null}
        >
          {busy === "thumbnail" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <ImageIcon className="size-4" aria-hidden />
          )}
          Update Thumbnail
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleDownloadModel()}
          disabled={busy !== null}
        >
          {busy === "download" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          Download Model
        </Button>
      </div>

      {status ? (
        <p className="text-xs text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}

export function metadataFromScene(scene: {
  name: string | null;
  sku: string | null;
  category: string | null;
  note: string | null;
}): UploadMetadata {
  return {
    name: scene.name ?? "",
    sku: scene.sku ?? "",
    category: scene.category ?? DEFAULT_JEWELRY_CATEGORY,
    note: scene.note ?? "",
  };
}
