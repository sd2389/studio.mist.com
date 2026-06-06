"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { AiBgModal } from "@/components/modals/AiBgModal";
import { ExportModal } from "@/components/modals/ExportModal";
import { HiResExportModal } from "@/components/modals/HiResExportModal";
import { Video360Modal } from "@/components/modals/Video360Modal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StudioSidebar, ZoomControls } from "@/features/viewer";
import { StoneCanvas } from "@/components/stones/StoneCanvas";
import { getCutById, type CutId } from "@/lib/stones/cut-geometries";
import { cn } from "@/lib/utils";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

export function StoneViewer({ cutId }: { cutId: CutId }) {
  const cut = getCutById(cutId);
  if (!cut) throw new Error(`Unknown cut id: ${cutId}`);

  const preset = useMaterialPresetStore((s) => s.preset);
  const autoRotate = useMaterialPresetStore((s) => s.autoRotate);
  const lighting = useMaterialPresetStore((s) => s.lighting);

  const [aiOpen, setAiOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [hiResOpen, setHiResOpen] = useState(false);
  const [video360Open, setVideo360Open] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  const modelId = `stone-${cut.id}`;

  return (
    <>
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-muted/30 lg:flex-row">
        <aside className="hidden h-full w-80 shrink-0 flex-col border-r border-border bg-card lg:flex xl:w-[360px] 2xl:w-[400px]">
          <StudioSidebar
            modelId={modelId}
            onOpenAi={() => setAiOpen(true)}
            onOpenExport={() => setExportOpen(true)}
            onOpenHiResExport={() => setHiResOpen(true)}
            onOpenVideo360={() => setVideo360Open(true)}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 py-2.5 sm:px-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-foreground sm:text-lg">{cut.label}</p>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
                Diamond cut · {preset} · {lighting}
              </p>
            </div>
            <Link
              href="/stones"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowLeft className="size-4" aria-hidden />
              <span className="hidden sm:inline">All cuts</span>
            </Link>
          </header>
          <motion.div
            className="relative min-h-0 flex-1"
            initial={{ opacity: 0.88, scale: 0.995 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <StoneCanvas cut={cut} preset={preset} autoRotate={autoRotate} lighting={lighting} />
            <ZoomControls />
          </motion.div>
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        className="fixed bottom-5 left-4 z-50 gap-2 rounded-full border border-border bg-card text-foreground shadow-sm backdrop-blur-sm lg:hidden"
        onClick={() => setMobileControlsOpen(true)}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Controls
      </Button>

      <Sheet open={mobileControlsOpen} onOpenChange={setMobileControlsOpen}>
        <SheetContent side="bottom" className="h-[min(85dvh,640px)] border-border bg-card p-0 sm:h-[min(80dvh,720px)]">
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base font-semibold text-foreground">Studio controls</SheetTitle>
          </SheetHeader>
          <StudioSidebar
            className="max-h-[calc(min(85dvh,640px)-56px)] sm:max-h-[calc(min(80dvh,720px)-56px)]"
            modelId={modelId}
            onOpenAi={() => {
              setMobileControlsOpen(false);
              setAiOpen(true);
            }}
            onOpenExport={() => {
              setMobileControlsOpen(false);
              setExportOpen(true);
            }}
            onOpenHiResExport={() => {
              setMobileControlsOpen(false);
              setHiResOpen(true);
            }}
            onOpenVideo360={() => {
              setMobileControlsOpen(false);
              setVideo360Open(true);
            }}
          />
        </SheetContent>
      </Sheet>

      <AiBgModal open={aiOpen} onOpenChange={setAiOpen} modelId={modelId} />
      <ExportModal open={exportOpen} onOpenChange={setExportOpen} modelId={modelId} />
      <HiResExportModal open={hiResOpen} onOpenChange={setHiResOpen} modelId={modelId} />
      <Video360Modal open={video360Open} onOpenChange={setVideo360Open} modelId={modelId} />
    </>
  );
}
