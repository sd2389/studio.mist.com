"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { takeDesignHandoff } from "@/lib/design-handoff";

/**
 * `/upload-model?from=design`: pick up the model the design page handed over and ingest it
 * exactly as if it had been dropped. The handoff is single-use, so a reload does nothing.
 */
export function useDesignHandoffImport(
  ingestFile: (file: File) => Promise<void>,
  showError: (message: string) => void,
): void {
  const fromDesign = useSearchParams().get("from") === "design";
  // StrictMode replays effects; taking the handoff twice would lose it on the second take.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!fromDesign || startedRef.current) return;
    startedRef.current = true;
    void takeDesignHandoff()
      .then((file) => (file ? ingestFile(file) : undefined))
      .catch((err: unknown) => {
        console.warn("[upload] design handoff failed:", err);
        showError("Could not bring your design over — export it again from the design page.");
      });
  }, [fromDesign, ingestFile, showError]);
}
