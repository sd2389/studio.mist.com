"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type RevokeApiKeyDialogProps = {
  keyName: string;
  revoking: boolean;
  onConfirm: () => void;
};

/** Revoke, asked first: the key is refused from its next request on, for good. */
export function RevokeApiKeyDialog({ keyName, revoking, onConfirm }: RevokeApiKeyDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={revoking} onClick={() => setOpen(true)}>
        {revoking ? "Revoking…" : "Revoke"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {keyName}?</DialogTitle>
            <DialogDescription>
              Anything still using this key is refused from its next request. This can&apos;t be undone.
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
              Revoke the key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
