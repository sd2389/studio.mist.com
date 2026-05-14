"use client";

import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPublicApiUrl } from "@/lib/api-url";
import { cn } from "@/lib/utils";
import { captureTransparentPng } from "@/stores/transparent-capture-store";

const PLACEHOLDER_PREVIEWS = [
  { id: "1", label: "Marble & velvet", gradient: "from-stone-200 to-amber-100/80" },
  { id: "2", label: "Luxury studio", gradient: "from-zinc-200 to-neutral-100" },
  { id: "3", label: "Soft dusk", gradient: "from-slate-200 to-violet-100" },
];

type AiBgModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelId?: string;
};

export function AiBgModal({ open, onOpenChange, modelId }: AiBgModalProps) {
  const [prompt, setPrompt] = useState(
    "luxury jewelry catalog photo, macro shot, studio lighting, sharp gem focus, neutral background",
  );
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResultUrl, setLastResultUrl] = useState<string | null>(null);

  async function generateAI() {
    setError(null);
    setLastResultUrl(null);
    const transparentPNG = captureTransparentPng();
    if (!transparentPNG) {
      setError("3D view not ready — wait for the model to load, then try again.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/ai-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jewelry_b64: transparentPNG,
          prompt,
        }),
      });
      const data = (await response.json()) as {
        result_url?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      if (!data.result_url) {
        const base = getPublicApiUrl();
        throw new Error(
          base
            ? "API returned no result_url — check FastAPI logs."
            : "Set NEXT_PUBLIC_API_URL so the app can open files from your API.",
        );
      }
      setLastResultUrl(data.result_url);
      window.open(data.result_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-foreground">
            <Sparkles className="size-5 text-primary" aria-hidden />
            AI background
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Captures a <strong>transparent PNG</strong> from the viewer, then calls your FastAPI{" "}
            <code className="rounded bg-muted px-1 text-xs">/ai-background</code>. Default mode is{" "}
            <code className="rounded bg-muted px-1 text-xs">stub</code> (white composite); set{" "}
            <code className="rounded bg-muted px-1 text-xs">AI_BACKGROUND_MODE=sdxl</code> on a GPU
            host for real inpainting.
            {modelId ? (
              <>
                {" "}
                Scene: <span className="text-foreground/80">{modelId}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ai-prompt" className="text-muted-foreground">
              Prompt
            </Label>
            <Input
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="border-border bg-background"
              placeholder="luxury studio…"
            />
          </div>
          <Button
            type="button"
            className="w-full gap-2"
            disabled={busy}
            onClick={() => void generateAI()}
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-4" aria-hidden />
                Generate (transparent capture → API)
              </>
            )}
          </Button>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {lastResultUrl ? (
            <a
              href={lastResultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "inline-flex w-full items-center justify-center gap-2",
              )}
            >
              <ExternalLink className="size-4" aria-hidden />
              Open last result
            </a>
          ) : null}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Style references (demo)
            </p>
            <div className="relative overflow-hidden rounded-xl border border-border">
              <div
                className={`flex aspect-video items-end bg-gradient-to-br p-6 ${PLACEHOLDER_PREVIEWS[idx].gradient}`}
              >
                <p className="text-sm font-medium text-foreground/90 drop-shadow-sm">
                  {PLACEHOLDER_PREVIEWS[idx].label}
                </p>
              </div>
              <div className="flex items-center justify-between border-t border-border bg-muted/50 px-2 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    setIdx((i) => (i - 1 + PLACEHOLDER_PREVIEWS.length) % PLACEHOLDER_PREVIEWS.length)
                  }
                  aria-label="Previous preview"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {idx + 1} / {PLACEHOLDER_PREVIEWS.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIdx((i) => (i + 1) % PLACEHOLDER_PREVIEWS.length)}
                  aria-label="Next preview"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
