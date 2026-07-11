"use client";

import { Check, Code, Copy, ExternalLink, Link2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  buildEmbedIframeSnippet,
  buildEmbedUrl,
  resolveEmbedKey,
  resolveEmbedSettings,
} from "@/lib/embed-settings";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

type EditorEmbedTabProps = {
  viewerId: string;
  sku?: string;
  displayName?: string;
};

type CopyTarget = "html" | "link" | null;

export function EditorEmbedTab({ viewerId, sku, displayName }: EditorEmbedTabProps) {
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const setEmbedSettings = useMaterialPresetStore((s) => s.setEmbedSettings);

  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState<CopyTarget>(null);

  const embedKey = resolveEmbedKey(sku, viewerId);
  const settings = resolveEmbedSettings(sceneSettings.embed);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const canEmbed = Boolean(sku?.trim());
  const embedUrl = useMemo(
    () => (canEmbed && origin ? buildEmbedUrl(origin, embedKey, settings) : ""),
    [canEmbed, origin, embedKey, settings],
  );
  const iframeSnippet = useMemo(
    () =>
      embedUrl
        ? buildEmbedIframeSnippet(embedUrl, {
            title: displayName?.trim() || embedKey,
          })
        : "",
    [embedUrl, displayName, embedKey],
  );

  const canCopyEmbed = Boolean(canEmbed && embedUrl);

  async function copyText(text: string, target: CopyTarget) {
    if (!canCopyEmbed || !text) return;
    await navigator.clipboard.writeText(text);
    setCopied(target);
    window.setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Embed</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Share a SKU-keyed iframe with branding and viewer controls.
          </p>
        </div>
        {sku ? (
          <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Embed key: <span className="font-medium text-foreground">{sku}</span>
          </p>
        ) : (
          <p className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Publish or set a SKU before embedding
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Viewer controls
          </p>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="embed-chrome" className="text-xs">
              Show header chrome
            </Label>
            <Switch
              id="embed-chrome"
              checked={settings.showChrome}
              onCheckedChange={(value) => setEmbedSettings({ showChrome: value })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="embed-title" className="text-xs">
              Show model title
            </Label>
            <Switch
              id="embed-title"
              checked={settings.showTitle}
              onCheckedChange={(value) => setEmbedSettings({ showTitle: value })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="embed-autorotate" className="text-xs">
              Auto-rotate on load
            </Label>
            <Switch
              id="embed-autorotate"
              checked={settings.autoRotate}
              onCheckedChange={(value) => setEmbedSettings({ autoRotate: value })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="embed-zoom" className="text-xs">
              Show zoom controls
            </Label>
            <Switch
              id="embed-zoom"
              checked={settings.showZoomControls}
              onCheckedChange={(value) => setEmbedSettings({ showZoomControls: value })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="embed-studio" className="text-xs">
              Show studio link
            </Label>
            <Switch
              id="embed-studio"
              checked={settings.showStudioLink}
              onCheckedChange={(value) => setEmbedSettings({ showStudioLink: value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="embed-branding" className="text-xs text-muted-foreground">
              Branding text (optional)
            </Label>
            <Input
              id="embed-branding"
              value={settings.brandingText ?? ""}
              onChange={(event) =>
                setEmbedSettings({ brandingText: event.target.value.trim() || null })
              }
              placeholder="Your brand name"
              className="h-9 text-xs"
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Embed URL
          </p>
          <Textarea
            readOnly
            value={embedUrl}
            className="min-h-[72px] resize-none border-border bg-muted/50 font-mono text-[11px] text-foreground/90"
          />
        </div>

        {showCode ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Iframe code
            </p>
            <Textarea
              readOnly
              value={iframeSnippet}
              className="min-h-[140px] resize-none border-border bg-muted/50 font-mono text-[11px] text-foreground/90"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2 text-xs"
            onClick={() => void copyText(iframeSnippet, "html")}
            disabled={!canCopyEmbed}
          >
            {copied === "html" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Copy HTML
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 text-xs"
            onClick={() => setShowCode((value) => !value)}
            disabled={!canCopyEmbed}
          >
            <Code className="size-3.5" aria-hidden />
            {showCode ? "Hide code" : "View code"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 text-xs"
            onClick={() => canCopyEmbed && window.open(embedUrl, "_blank", "noopener")}
            disabled={!canCopyEmbed}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            Preview
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2 text-xs"
            onClick={() => void copyText(embedUrl, "link")}
            disabled={!canCopyEmbed}
          >
            {copied === "link" ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
            Copy link
          </Button>
        </div>
      </div>
    </div>
  );
}
