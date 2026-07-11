"use client";

import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  buildEmbedIframeSnippet,
  buildEmbedUrl,
  resolveEmbedKey,
} from "@/lib/embed-settings";

type ExportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId: string;
  /** Required for a live embed URL — without SKU, copy stays disabled. */
  sku?: string | null;
};

export function ExportModal({ open, onOpenChange, modelId, sku }: ExportModalProps) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const canEmbed = Boolean(sku?.trim());
  const embedKey = resolveEmbedKey(sku, modelId);
  const embedSrc = useMemo(
    () => (canEmbed && origin ? buildEmbedUrl(origin, embedKey) : ""),
    [canEmbed, origin, embedKey],
  );
  const snippet = useMemo(
    () =>
      embedSrc
        ? buildEmbedIframeSnippet(embedSrc, { height: 640, title: "DevJewels 3D" })
        : "",
    [embedSrc],
  );

  async function copySnippet() {
    if (!canEmbed || !snippet) return;
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
        {canEmbed ? (
          <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Embed key: <span className="font-medium text-foreground">{sku?.trim()}</span>
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Publish or set a SKU before embedding
          </p>
        )}
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
          disabled={!canEmbed || !snippet}
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
