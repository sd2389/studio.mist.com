"use client";

import { UploadCloud } from "lucide-react";
import { useState } from "react";
import { MODEL_FILE_ACCEPT, SUPPORTED_FORMATS_LABEL } from "@/lib/upload/model-files";
import { SAMPLE_MODELS, type SampleModel } from "@/lib/upload/sample-models";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type UploadDropPanelProps = {
  busy?: boolean;
  /** Everything dropped or picked at once: the model plus its MTL, textures or .bin. */
  onFiles: (files: File[]) => void;
  onSample: (sample: SampleModel) => void;
  className?: string;
};

export function UploadDropPanel({ busy, onFiles, onSample, className }: UploadDropPanelProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/80 px-6 py-10 text-center shadow-sm transition-colors hover:border-primary/30",
          dragging && "border-primary/50 bg-primary/5",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <UploadCloud className="size-10 text-primary/80" aria-hidden />
        <div>
          <p className="text-base font-medium text-foreground">Drag & drop your CAD file</p>
          <p className="mt-1 text-xs text-muted-foreground">or browse manually — {SUPPORTED_FORMATS_LABEL}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            Bringing an OBJ? Select its .mtl and textures with it.
          </p>
        </div>
        <label>
          <span className="sr-only">Choose model file</span>
          <input
            type="file"
            accept={MODEL_FILE_ACCEPT}
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) onFiles(files);
              e.target.value = "";
            }}
          />
          <span className="inline-flex cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90">
            Browse files
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Requirements & recommendations
        </p>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>Polygon limits depend on your plan (Free 100k · Grow 500k · Studio 2M).</li>
          <li>Metal and faceted stones are detected automatically, even from a single merged mesh.</li>
          <li>Keep stones as separate solids (not fused into the metal) for accurate cuts.</li>
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Quick start
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLE_MODELS.map((sample) => (
            <Button
              key={sample.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onSample(sample)}
            >
              {sample.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
