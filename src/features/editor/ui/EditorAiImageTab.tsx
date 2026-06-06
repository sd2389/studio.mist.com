"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requestAiImage } from "@/lib/ai-image-api";
import { fetchBillingAccount } from "@/lib/billing/client";
import { formatAiCredits } from "@/lib/ai-image-credits";
import {
  AI_MODEL_VARIANTS,
  AI_SHOOT_PRESETS,
  DEFAULT_AI_CUSTOM_PROMPT,
  type AiImageSubMode,
  type AiModelVariant,
} from "@/lib/ai-image-presets";
import { downloadBlob } from "@/lib/export-presets";
import { getPublicApiUrl } from "@/lib/api-url";
import { cn } from "@/lib/utils";
import { useAiImageCreditsStore } from "@/stores/ai-image-credits-store";
import { captureTransparentPng } from "@/stores/transparent-capture-store";

type EditorAiImageTabProps = {
  viewerId: string;
};

const SUB_MODES: { id: AiImageSubMode; label: string; description: string }[] = [
  {
    id: "shoot",
    label: "Shoot",
    description: "Preset studio and lifestyle scenes.",
  },
  {
    id: "model",
    label: "Model",
    description: "Jewelry on an AI model (hand, neck, or ear).",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Describe your own background or scene.",
  },
];

export function EditorAiImageTab({ viewerId }: EditorAiImageTabProps) {
  const remaining = useAiImageCreditsStore((s) => s.remaining);
  const total = useAiImageCreditsStore((s) => s.total);
  const consumeOne = useAiImageCreditsStore((s) => s.consumeOne);
  const hydrateFromServer = useAiImageCreditsStore((s) => s.hydrateFromServer);
  useEffect(() => {
    fetchBillingAccount()
      .then((account) => {
        hydrateFromServer(
          account.balances.ai_image_credits,
          account.allotments.ai_image_credits,
        );
      })
      .catch(() => {});
  }, [hydrateFromServer]);

  const [subMode, setSubMode] = useState<AiImageSubMode>("shoot");
  const [presetIdx, setPresetIdx] = useState(0);
  const [modelVariant, setModelVariant] = useState<AiModelVariant>("hand");
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_AI_CUSTOM_PROMPT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastResultUrl, setLastResultUrl] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<string | null>(null);

  const selectedPreset = AI_SHOOT_PRESETS[presetIdx] ?? AI_SHOOT_PRESETS[0]!;
  const creditsLabel = useMemo(() => formatAiCredits(remaining, total), [remaining, total]);

  async function handleGenerate() {
    setError(null);
    setStatus(null);
    setLastResultUrl(null);
    setLastMode(null);

    if (remaining <= 0) {
      setError("No AI image credits remaining. Upgrade or wait for your next billing cycle.");
      return;
    }

    const jewelry_b64 = captureTransparentPng();
    if (!jewelry_b64) {
      setError("3D view not ready — wait for the model to load, then try again.");
      return;
    }

    if (!consumeOne()) {
      setError("No AI image credits remaining.");
      return;
    }

    setBusy(true);
    try {
      const data = await requestAiImage({
        jewelry_b64,
        sub_mode: subMode,
        preset_id: subMode === "shoot" ? selectedPreset.id : null,
        model_variant: subMode === "model" ? modelVariant : null,
        prompt: subMode === "custom" ? customPrompt.trim() : null,
      });

      if (!data.result_url) {
        const base = getPublicApiUrl();
        throw new Error(
          base
            ? "API returned no result_url — check FastAPI logs."
            : "Set NEXT_PUBLIC_API_URL so the app can open files from your API.",
        );
      }

      setLastResultUrl(data.result_url);
      setLastMode(data.mode ?? null);
      setStatus("AI image ready");
    } catch (e) {
      useAiImageCreditsStore.setState((s) => ({
        remaining: Math.min(s.total, s.remaining + 1),
        usedThisCycle: Math.max(0, s.usedThisCycle - 1),
      }));
      const message = e instanceof Error ? e.message : "Generation failed";
      setError(message);
      if (message.toLowerCase().includes("credit")) {
        fetchBillingAccount()
          .then((account) =>
            hydrateFromServer(
              account.balances.ai_image_credits,
              account.allotments.ai_image_credits,
            ),
          )
          .catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!lastResultUrl) return;
    setError(null);
    try {
      const response = await fetch(lastResultUrl);
      if (!response.ok) throw new Error("Could not download the image.");
      const blob = await response.blob();
      const suffix = subMode === "shoot" ? selectedPreset.id : subMode;
      downloadBlob(blob, `${viewerId}-ai-${suffix}.png`);
      setStatus("Image downloaded");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">AI Image</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Shoot, on-model, or custom backgrounds from a transparent viewport capture.
            </p>
          </div>
          <div className="shrink-0 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              AI credits
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground">{creditsLabel}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Mode
          </p>
          <div className="grid grid-cols-3 gap-2">
            {SUB_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setSubMode(mode.id)}
                className={cn(
                  "rounded-lg border px-2 py-2 text-left transition-colors",
                  subMode === mode.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                <p className="text-sm font-medium">{mode.label}</p>
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                  {mode.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {subMode === "shoot" ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Scene preset
            </p>
            <div className="relative overflow-hidden rounded-xl border border-border">
              <div
                className={cn(
                  "flex aspect-video items-end bg-gradient-to-br p-4",
                  selectedPreset.gradient,
                )}
              >
                <div>
                  <p className="text-sm font-medium text-foreground/90 drop-shadow-sm">
                    {selectedPreset.label}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[10px] text-foreground/70">
                    {selectedPreset.prompt}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border bg-muted/50 px-2 py-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    setPresetIdx(
                      (i) => (i - 1 + AI_SHOOT_PRESETS.length) % AI_SHOOT_PRESETS.length,
                    )
                  }
                  aria-label="Previous preset"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {presetIdx + 1} / {AI_SHOOT_PRESETS.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPresetIdx((i) => (i + 1) % AI_SHOOT_PRESETS.length)}
                  aria-label="Next preset"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {AI_SHOOT_PRESETS.map((preset, index) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPresetIdx(index)}
                  className={cn(
                    "rounded-md border p-1 text-left transition-colors",
                    presetIdx === index
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-border hover:border-muted-foreground/40",
                  )}
                  title={preset.label}
                >
                  <div className={cn("aspect-square rounded bg-gradient-to-br", preset.gradient)} />
                  <p className="mt-1 truncate text-[9px] text-muted-foreground">{preset.label}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {subMode === "model" ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Placement
            </p>
            <div className="grid grid-cols-3 gap-2">
              {AI_MODEL_VARIANTS.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setModelVariant(variant.id)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-left transition-colors",
                    modelVariant === variant.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <p className="text-sm font-medium">{variant.label}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{variant.description}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Provider: stub by default. Set{" "}
              <code className="rounded bg-muted px-1 text-[10px]">AI_ON_MODEL_PROVIDER=replicate</code>{" "}
              + <code className="rounded bg-muted px-1 text-[10px]">REPLICATE_API_TOKEN</code> for hosted
              on-model shots.
            </p>
          </div>
        ) : null}

        {subMode === "custom" ? (
          <div className="space-y-2">
            <Label htmlFor="ai-custom-prompt" className="text-muted-foreground">
              Prompt
            </Label>
            <Textarea
              id="ai-custom-prompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={4}
              className="resize-none border-border bg-background text-sm"
              placeholder="Describe the scene…"
            />
          </div>
        ) : null}

        <Button
          type="button"
          className="w-full gap-2"
          disabled={busy || remaining <= 0}
          onClick={() => void handleGenerate()}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden />
              Generate AI image (1 credit)
            </>
          )}
        </Button>

        {remaining <= 0 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400" role="note">
            AI image credits exhausted. Upgrade your plan or purchase a top-up from your profile.
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {status ? (
          <p className="text-xs text-muted-foreground" role="status">
            {status}
            {lastMode ? ` · pipeline ${lastMode}` : ""}
          </p>
        ) : null}

        {lastResultUrl ? (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-xl border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lastResultUrl}
                alt="Latest AI generated jewelry image"
                className="aspect-video w-full object-cover"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={lastResultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "inline-flex items-center justify-center gap-2",
                )}
              >
                <ExternalLink className="size-4" aria-hidden />
                Open
              </a>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => void handleDownload()}
              >
                <Download className="size-4" aria-hidden />
                Download
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
