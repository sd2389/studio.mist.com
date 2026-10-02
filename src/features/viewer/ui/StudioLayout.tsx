"use client";

import { motion } from "framer-motion";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { StudioSidebar } from "./StudioSidebar";
import { useStudioModals, type StudioModalOpeners } from "./useStudioModals";
import { ZoomControls } from "./ZoomControls";

type StudioLayoutProps = {
  modelId: string;
  title: string;
  subtitle: string;
  back: { href: string; label: string };
  /** Header actions placed before the back link. */
  actions?: ReactNode;
  /** The 3D view. */
  children: ReactNode;
};

/**
 * Studio page around a canvas: sidebar on desktop, a controls sheet on phones, a header,
 * zoom controls and the export dialogs. Stone and gallery pages differ only in what they pass.
 */
export function StudioLayout({ modelId, title, subtitle, back, actions, children }: StudioLayoutProps) {
  const { openers, modals } = useStudioModals(modelId, null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // From the phone sheet, close it before a dialog opens over it.
  const sheetOpeners = Object.fromEntries(
    Object.entries(openers).map(([key, open]) => [key, () => { setSheetOpen(false); open(); }]),
  ) as StudioModalOpeners;

  return (
    <>
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-muted/30 lg:flex-row">
        <aside className="hidden h-full w-80 shrink-0 flex-col border-r border-border bg-card lg:flex xl:w-[360px] 2xl:w-[400px]">
          <StudioSidebar modelId={modelId} sku={null} {...openers} />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
          <header className="relative flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3 py-2.5 sm:px-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-foreground sm:text-lg">{title}</p>
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">{subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              {actions}
              <Link
                href={back.href}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground hover:text-foreground")}
              >
                <ArrowLeft className="size-4" aria-hidden />
                <span className="hidden sm:inline">{back.label}</span>
              </Link>
            </div>
          </header>
          <motion.div
            className="relative min-h-0 flex-1"
            initial={{ opacity: 0.88, scale: 0.995 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
            <ZoomControls />
          </motion.div>
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        className="fixed bottom-5 left-4 z-50 gap-2 rounded-full border border-border bg-card text-foreground shadow-sm backdrop-blur-sm lg:hidden"
        onClick={() => setSheetOpen(true)}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Controls
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[min(85dvh,640px)] border-border bg-card p-0 sm:h-[min(80dvh,720px)]">
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="text-base font-semibold text-foreground">Studio controls</SheetTitle>
          </SheetHeader>
          <StudioSidebar
            className="max-h-[calc(min(85dvh,640px)-56px)] sm:max-h-[calc(min(80dvh,720px)-56px)]"
            modelId={modelId}
            sku={null}
            {...sheetOpeners}
          />
        </SheetContent>
      </Sheet>

      {modals}
    </>
  );
}
