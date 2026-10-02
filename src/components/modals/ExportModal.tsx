"use client";

import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmbedKeyNotice, useCopyFeedback, useEmbedCode } from "@/components/embed/embed-code";

type ExportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  /** Required for a live embed URL — without SKU, copy stays disabled. */
  sku?: string | null;
};

export function ExportModal({ open, onOpenChange, modelId, sku }: ExportModalProps) {
  const { canEmbed, snippet } = useEmbedCode({ sku, modelId });
  const { copied, copy } = useCopyFeedback<"snippet">();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl text-foreground">Export embed</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Paste this iframe on your site or landing page.
          </DialogDescription>
        </DialogHeader>
        <EmbedKeyNotice sku={sku} />
        <Textarea
          readOnly
          value={snippet}
          className="min-h-[140px] resize-none border-border bg-muted/50 font-mono text-xs text-foreground/90"
        />
        <Button
          type="button"
          variant="default"
          className="w-full"
          onClick={() => void copy(snippet, "snippet")}
          disabled={!canEmbed || !snippet}
        >
          {copied === "snippet" ? (
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
          PNG exports use <span className="text-foreground">Download PNG</span> in the studio’s Export tab.
        </p>
      </DialogContent>
    </Dialog>
  );
}
