"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { putDesignHandoff } from "@/lib/design-handoff";
import { exportGlb, exportObj, exportStl, type BuiltPart } from "@/lib/jewelry-cad";

/**
 * Downloads and the "Open in Studio" handoff. Exports run from the parts already on
 * screen, so a file always matches the preview the customer approved.
 */

export type DesignAction = "stl" | "obj" | "glb" | "sizes" | "studio";

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

type Options = {
  parts: BuiltPart[] | null;
  fileStem: string;
  includeStones: boolean;
  buildSizesZip: (name: string, onProgress?: (done: number, total: number) => void) => Promise<Uint8Array>;
};

export function useDesignActions({ parts, fileStem, includeStones, buildSizesZip }: Options) {
  const router = useRouter();
  const [busy, setBusy] = useState<DesignAction | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: DesignAction, task: () => Promise<void>) => {
    setBusy(action);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }, []);

  const download = useCallback(
    (action: DesignAction) => {
      if (!parts) return;
      void run(action, async () => {
        if (action === "stl") {
          saveBlob(new Blob([asArrayBuffer(exportStl(parts, { includeStones }))], { type: "model/stl" }), `${fileStem}.stl`);
        } else if (action === "obj") {
          saveBlob(new Blob([exportObj(parts, { includeStones })], { type: "model/obj" }), `${fileStem}.obj`);
        } else if (action === "glb") {
          saveBlob(new Blob([await exportGlb(parts)], { type: "model/gltf-binary" }), `${fileStem}.glb`);
        } else if (action === "sizes") {
          const stem = fileStem.replace(/-us\d+(_\d+)?$/, "");
          const bytes = await buildSizesZip(stem, (done, total) => setProgress(`${done}/${total}`));
          saveBlob(new Blob([asArrayBuffer(bytes)], { type: "application/zip" }), `${stem}-all-sizes.zip`);
        }
      });
    },
    [parts, fileStem, includeStones, buildSizesZip, run],
  );

  const openInStudio = useCallback(() => {
    if (!parts) return;
    void run("studio", async () => {
      const glb = await exportGlb(parts);
      await putDesignHandoff(new File([glb], `${fileStem}.glb`, { type: "model/gltf-binary" }));
      router.push("/upload-model?from=design");
    });
  }, [parts, fileStem, router, run]);

  return { busy, progress, error, download, openInStudio };
}
