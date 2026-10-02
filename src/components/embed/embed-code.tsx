"use client";

import { useMemo, useState } from "react";
import { buildEmbedIframeSnippet, buildEmbedUrl, resolveEmbedKey, type EmbedSettings } from "@/lib/embed-settings";

type EmbedCodeInput = {
  sku?: string | null;
  modelId: string;
  /** Viewer options carried in the link; the default viewer when omitted. */
  settings?: EmbedSettings;
  /** iframe title; defaults to the embed key. */
  title?: string;
};

/** The embed link and iframe snippet for a model. Both stay empty until a SKU keys them. */
export function useEmbedCode({ sku, modelId, settings, title }: EmbedCodeInput) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const canEmbed = Boolean(sku?.trim());
  const embedKey = resolveEmbedKey(sku, modelId);
  const url = useMemo(
    () => (canEmbed && origin ? buildEmbedUrl(origin, embedKey, settings) : ""),
    [canEmbed, origin, embedKey, settings],
  );
  const snippet = useMemo(() => (url ? buildEmbedIframeSnippet(url, { title: title ?? embedKey }) : ""), [url, title, embedKey]);
  return { canEmbed, embedKey, url, snippet };
}

/** Copy text and remember which target was copied, for two seconds of "Copied" feedback. */
export function useCopyFeedback<T extends string>() {
  const [copied, setCopied] = useState<T | null>(null);
  async function copy(text: string, target: T) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(target);
    window.setTimeout(() => setCopied(null), 2000);
  }
  return { copied, copy };
}

/** The key an embed is published under, or why there is none yet. */
export function EmbedKeyNotice({ sku }: { sku?: string | null }) {
  const key = sku?.trim();
  if (key) {
    return (
      <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Embed key: <span className="font-medium text-foreground">{key}</span>
      </p>
    );
  }
  return (
    <p className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
      Publish or set a SKU before embedding
    </p>
  );
}
