"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditorAiImageTab } from "@/features/editor";

type AiVisualsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
};

/** Export / viewer entry for AI Visuals — same Background / Model UI as the editor tab. */
export function AiVisualsModal({ open, onOpenChange, modelId }: AiVisualsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-hidden border-border bg-card p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>AI Visuals</DialogTitle>
          <DialogDescription>
            Background scenes or on-model shots from a transparent viewport capture. Stub results are
            labeled when the pipeline runs in dev mode.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[90dvh] overflow-y-auto pt-1 pr-8">
          <EditorAiImageTab viewerId={modelId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
