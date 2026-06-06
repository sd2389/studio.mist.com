"use client";

import { UploadCloud } from "lucide-react";
import { SAMPLE_MODELS, type SampleModel } from "@/lib/upload/sample-models";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ACCEPT =
  ".glb,.gltf,.stl,.3dm,model/gltf-binary,model/gltf+json,model/stl,application/sla,model/vnd.rhino";

type UploadDropPanelProps = {
  busy?: boolean;
  onFile: (file: File) => void;
  onSample: (sample: SampleModel) => void;
  className?: string;
};

export function UploadDropPanel({ busy, onFile, onSample, className }: UploadDropPanelProps) {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/80 px-6 py-10 text-center shadow-sm transition-colors hover:border-primary/30",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <UploadCloud className="size-10 text-primary/80" aria-hidden />
        <div>
          <p className="text-base font-medium text-foreground">Drag & drop your CAD file</p>
          <p className="mt-1 text-xs text-muted-foreground">or browse manually — .3dm, .glb, .stl</p>
        </div>
        <label>
          <span className="sr-only">Choose model file</span>
          <input
            type="file"
            accept={ACCEPT}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
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
          <li>Keep poly count under 100k for best performance.</li>
          <li>Separate diamond meshes into their own layers for accurate cuts.</li>
          <li>Include at least one mesh for proper viewing.</li>
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
