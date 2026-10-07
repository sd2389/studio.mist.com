"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type CancelBatchDialogProps = {
  batchName: string;
  /** Designs not finished yet: what the cancel stops. */
  unfinished: number;
  canceling: boolean;
  onConfirm: () => void;
};

/** Cancel, asked first: what hasn't finished stops and gets its credits back; scenes made stay. */
export function CancelBatchDialog({ batchName, unfinished, canceling, onConfirm }: CancelBatchDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" disabled={canceling} onClick={() => setOpen(true)}>
        {canceling ? "Canceling…" : "Cancel batch"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {batchName}?</DialogTitle>
            <DialogDescription>
              {unfinished === 1
                ? "The design not finished yet stops, and the credits it holds come back."
                : `The ${unfinished} designs not finished yet stop, and the credits they hold come back.`}{" "}
              Scenes already made stay in your workshop. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              Cancel the batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
