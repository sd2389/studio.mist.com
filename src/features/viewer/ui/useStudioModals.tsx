"use client";

import { useState, type ReactNode } from "react";
import { AiVisualsModal } from "@/components/modals/AiVisualsModal";
import { ExportModal } from "@/components/modals/ExportModal";
import { HiResExportModal } from "@/components/modals/HiResExportModal";
import { Video360Modal } from "@/components/modals/Video360Modal";

export type StudioModalOpeners = {
  onOpenAi: () => void;
  onOpenExport: () => void;
  onOpenHiResExport: () => void;
  onOpenVideo360: () => void;
};

type StudioModal = "ai" | "export" | "hires" | "video";

/**
 * The studio's export dialogs — embed and share, hi-res still, 360° video, AI visuals — and
 * the openers the sidebar calls. One at a time, so one piece of state.
 */
export function useStudioModals(modelId: string, sku: string | null): { openers: StudioModalOpeners; modals: ReactNode } {
  const [open, setOpen] = useState<StudioModal | null>(null);
  const change = (modal: StudioModal) => (next: boolean) => setOpen(next ? modal : null);
  const openers: StudioModalOpeners = {
    onOpenAi: () => setOpen("ai"),
    onOpenExport: () => setOpen("export"),
    onOpenHiResExport: () => setOpen("hires"),
    onOpenVideo360: () => setOpen("video"),
  };
  const modals = (
    <>
      <AiVisualsModal open={open === "ai"} onOpenChange={change("ai")} modelId={modelId} />
      <ExportModal open={open === "export"} onOpenChange={change("export")} modelId={modelId} sku={sku} />
      <HiResExportModal open={open === "hires"} onOpenChange={change("hires")} modelId={modelId} />
      <Video360Modal open={open === "video"} onOpenChange={change("video")} modelId={modelId} />
    </>
  );
  return { openers, modals };
}
