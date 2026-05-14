"use client";

import { UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { detectSlotsFromUpload } from "@/lib/slot-materials/detect-upload-slots";
import { buildModelConfigFromSlots, getDefaultSceneSettings } from "@/lib/slot-materials/model-config";
import { cn } from "@/lib/utils";
import { viewerIdFromModelKey } from "@/lib/model-key";

function isSupportedModelFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith(".glb") || n.endsWith(".gltf") || n.endsWith(".stl") || n.endsWith(".3dm");
}

function contentTypeFor(file: File): string {
  const n = file.name.toLowerCase();
  if (file.type) return file.type;
  if (n.endsWith(".gltf")) return "model/gltf+json";
  if (n.endsWith(".stl")) return "model/stl";
  if (n.endsWith(".3dm")) return "model/vnd.rhino";
  return "model/gltf-binary";
}

export type ModelUploadZoneProps = {
  variant?: "landing" | "compact" | "modal";
  /** If set, called instead of navigating (e.g. close modal). */
  onUploaded?: (viewerId: string) => void;
  className?: string;
  showProgress?: boolean;
};

export function ModelUploadZone({
  variant = "landing",
  onUploaded,
  className,
  showProgress = false,
}: ModelUploadZoneProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const apiPublicConfigured = Boolean(process.env.NEXT_PUBLIC_API_URL);

  const bump = useCallback((n: number) => {
    setProgress((p) => Math.max(p, n));
  }, []);

  const finish = useCallback(
    (viewerId: string) => {
      setProgress(100);
      if (onUploaded) onUploaded(viewerId);
      else router.push(`/viewer/${encodeURIComponent(viewerId)}`);
    },
    [onUploaded, router],
  );

  const runUpload = useCallback(
    async (file: File) => {
      if (!isSupportedModelFile(file)) {
        setMsg("Supports GLB / glTF / STL / 3DM only");
        return;
      }
      setBusy(true);
      setMsg(null);
      setProgress(0);
      const ctype = contentTypeFor(file);
      const detectedSlots = await detectSlotsFromUpload(file);
      const modelConfig = buildModelConfigFromSlots(detectedSlots);
      const slotSelections = modelConfig.defaultMaterials;
      const sceneSettings = getDefaultSceneSettings();

      try {
        bump(showProgress ? 8 : 0);
        const presignRes = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, content_type: ctype }),
        });

        if (presignRes.ok) {
          bump(35);
          const p = (await presignRes.json()) as {
            upload_url: string;
            key: string;
            method?: string;
          };
          const put = await fetch(p.upload_url, {
            method: p.method || "PUT",
            body: file,
            headers: { "Content-Type": ctype },
          });
          if (!put.ok) {
            throw new Error(`Direct upload failed (${put.status})`);
          }
          bump(70);
          const reg = await fetch("/api/upload/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key: p.key,
              model_config: modelConfig,
              slot_selections: slotSelections,
              scene_settings: sceneSettings,
            }),
          });
          const regJson = (await reg.json()) as { error?: string };
          if (!reg.ok) {
            throw new Error(regJson.error ?? "Register failed");
          }
          if (!apiPublicConfigured) {
            throw new Error(
              "Set NEXT_PUBLIC_API_URL to the FastAPI origin so the viewer can load this model",
            );
          }
          finish(viewerIdFromModelKey(p.key));
          return;
        }

        bump(20);
        const fd = new FormData();
        fd.append("file", file);
        fd.append("model_config", JSON.stringify(modelConfig));
        fd.append("slot_selections", JSON.stringify(slotSelections));
        fd.append("scene_settings", JSON.stringify(sceneSettings));
        const up = await fetch("/api/models/upload", { method: "POST", body: fd });
        const data = (await up.json()) as { model_key?: string; error?: string };
        if (!up.ok) {
          throw new Error(data.error ?? "Upload failed");
        }
        if (!data.model_key) {
          throw new Error("Missing model_key");
        }
        if (!apiPublicConfigured) {
          throw new Error(
            "Set NEXT_PUBLIC_API_URL to the FastAPI origin so the viewer can load this model",
          );
        }
        bump(90);
        finish(viewerIdFromModelKey(data.model_key));
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
        setTimeout(() => setProgress(0), 600);
      }
    },
    [apiPublicConfigured, bump, finish, showProgress],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) void runUpload(f);
    },
    [runUpload],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void runUpload(f);
      e.target.value = "";
    },
    [runUpload],
  );

  const isLanding = variant === "landing";
  const isModal = variant === "modal";

  return (
    <div className={cn("w-full", isLanding && "max-w-xl", className)}>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center transition-colors",
          isLanding &&
            "border-border bg-card py-14 shadow-sm hover:border-primary/25",
          isModal && "border-border bg-card py-8",
          variant === "compact" && "border-border bg-muted/30 py-6",
        )}
      >
        <UploadCloud
          className={cn("text-primary/80", isLanding ? "size-12" : "size-9")}
          aria-hidden
        />
        <div>
          <p
            className={cn(
              "font-medium text-foreground",
              isLanding ? "text-base" : "text-sm",
            )}
          >
            Drop your CAD file
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            GLB · glTF · STL · 3DM (Rhino) — Presigned S3 or API multipart
          </p>
        </div>
        {showProgress && busy ? (
          <div className="w-full max-w-xs space-y-2">
            <Progress value={progress} />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Uploading…</p>
          </div>
        ) : null}
        <label className="mt-1">
          <span className="sr-only">Choose model file</span>
          <input
            type="file"
            accept=".glb,.gltf,.stl,.3dm,model/gltf-binary,model/gltf+json,model/stl,application/sla,model/vnd.rhino"
            className="hidden"
            disabled={busy}
            onChange={onChange}
          />
          <span
            className={cn(
              "inline-flex cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90",
              busy && "pointer-events-none opacity-60",
            )}
          >
            {busy ? "Uploading…" : "Browse files"}
          </span>
        </label>
      </div>
      {msg ? (
        <p className="mt-2 text-center text-xs text-red-400" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
