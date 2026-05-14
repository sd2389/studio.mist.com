"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModelUploadZone } from "@/components/upload/ModelUploadZone";

type UploadModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function UploadModal({ open, onOpenChange }: UploadModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Upload model</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Drag and drop or browse. GLB and glTF supported.
          </DialogDescription>
        </DialogHeader>
        <ModelUploadZone
          variant="modal"
          showProgress
          onUploaded={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
