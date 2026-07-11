"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AiBackgroundPanel,
  type BackgroundKind,
} from "@/features/editor/ui/ai-visuals/AiBackgroundPanel";
import { AiModelPanel } from "@/features/editor/ui/ai-visuals/AiModelPanel";
import {
  AiVisualsEntryPicker,
  type AiVisualsEntry,
} from "@/features/editor/ui/ai-visuals/AiVisualsEntryPicker";
import { AiVisualsResult } from "@/features/editor/ui/ai-visuals/AiVisualsResult";
import { aiImageStatusLabel, requestAiImage } from "@/lib/ai-image-api";
import { fetchBillingAccount } from "@/lib/billing/client";
import { formatAiCredits } from "@/lib/ai-image-credits";
import {
  AI_SHOOT_PRESETS,
  DEFAULT_AI_CUSTOM_PROMPT,
  type AiImageSubMode,
  type AiModelVariant,
} from "@/lib/ai-image-presets";
import { downloadBlob } from "@/lib/export-presets";
import { getPublicApiUrl } from "@/lib/api-url";
import { useAiImageCreditsStore } from "@/stores/ai-image-credits-store";
import { captureTransparentPng } from "@/stores/transparent-capture-store";

type EditorAiImageTabProps = {
  viewerId: string;
};

function resolveSubMode(entry: AiVisualsEntry, backgroundKind: BackgroundKind): AiImageSubMode {
  if (entry === "model") return "model";
  return backgroundKind === "custom" ? "custom" : "shoot";
}

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

  const [entry, setEntry] = useState<AiVisualsEntry>("background");
  const [backgroundKind, setBackgroundKind] = useState<BackgroundKind>("shoot");
  const [presetIdx, setPresetIdx] = useState(0);
  const [modelVariant, setModelVariant] = useState<AiModelVariant>("hand");
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_AI_CUSTOM_PROMPT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastResultUrl, setLastResultUrl] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<string | null>(null);

  const subMode = resolveSubMode(entry, backgroundKind);
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
      setStatus(aiImageStatusLabel(data.mode));
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
            <h2 className="text-sm font-semibold text-foreground">AI Visuals</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Background scenes primary; on-model shots secondary. Uses a transparent viewport
              capture.
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
        <AiVisualsEntryPicker
          entry={entry}
          onSelectBackground={() => setEntry("background")}
          onSelectModel={() => setEntry("model")}
        />

        {entry === "background" ? (
          <AiBackgroundPanel
            backgroundKind={backgroundKind}
            onBackgroundKindChange={setBackgroundKind}
            presetIdx={presetIdx}
            onPresetIdxChange={setPresetIdx}
            customPrompt={customPrompt}
            onCustomPromptChange={setCustomPrompt}
          />
        ) : (
          <AiModelPanel modelVariant={modelVariant} onModelVariantChange={setModelVariant} />
        )}

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
          <AiVisualsResult resultUrl={lastResultUrl} onDownload={() => void handleDownload()} />
        ) : null}
      </div>
    </div>
  );
}
