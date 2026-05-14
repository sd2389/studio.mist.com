"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type ExportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
};

export function ExportModal({ open, onOpenChange, modelId }: ExportModalProps) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embedSrc = `${origin}/embed/${encodeURIComponent(modelId)}`;
  const snippet = `<iframe\n  src="${embedSrc}"\n  width="100%"\n  height="640"\n  style="border:0;border-radius:12px;max-width:100%"\n  loading="lazy"\n  title="DevJewels 3D"\n></iframe>`;

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl text-foreground">Export embed</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Paste this iframe on your site or landing page.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          readOnly
          value={snippet}
          className="min-h-[140px] resize-none border-border bg-muted/50 font-mono text-xs text-foreground/90"
        />
        <Button
          type="button"
          variant="default"
          className="w-full"
          onClick={() => void copySnippet()}
        >
          {copied ? (
            <>
              <Check className="size-4" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden />
              Copy code
            </>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          PNG exports use <span className="text-foreground">Screenshot</span> in the studio sidebar.
        </p>
      </DialogContent>
    </Dialog>
  );
}
