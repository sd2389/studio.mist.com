"use client";

import { FileDropZone } from "@/components/ui/file-drop-zone";
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
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <FileDropZone
        title="Drag & drop your CAD file"
        hint={
          <>
            <p>or browse manually — {SUPPORTED_FORMATS_LABEL}</p>
            <p className="text-[11px] text-muted-foreground/80">Bringing an OBJ? Select its .mtl and textures with it.</p>
          </>
        }
        accept={MODEL_FILE_ACCEPT}
        busy={busy}
        onFiles={(dropped) => onFiles(dropped.map(({ file }) => file))}
      />

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
