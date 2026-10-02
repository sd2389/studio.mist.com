"use client";

import Link from "next/link";
import { useDesignHandoffImport } from "@/features/upload/hooks/useDesignHandoffImport";
import { useUploadModelFlow } from "@/features/upload/hooks/useUploadModelFlow";
import { UploadDropPanel } from "./UploadDropPanel";
import { UploadLayersEditor } from "./UploadLayersEditor";
import { UploadMetadataForm } from "./UploadMetadataForm";
import { UploadModelSummary, UploadParsingState, UploadPolyLimitNotice } from "./UploadModelStatus";
import { UploadModelViewport } from "./UploadModelViewport";
import { UploadSignInDialog } from "./UploadSignInDialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BuyCreditsLink, outOfCredits } from "@/features/billing/ui/BuyCreditsLink";

export function UploadModelShell() {
  const flow = useUploadModelFlow();
  const {
    phase,
    parsed,
    layers,
    metadata,
    setMetadata,
    error,
    skuError,
    saveProgress,
    saveMessage,
    authDialogOpen,
    hiddenSlots,
    slotIds,
    overPolyLimit,
    maxPolygons,
    planLabel,
    busy,
    decimating,
    parseStatus,
    previewRevision,
    reset,
    ingestFile,
    ingestFiles,
    showError,
    handleSample,
    handleRename,
    handleToggleVisibility,
    handleDecimate,
    handleSave,
    handleAuthDialogOpenChange,
    handleAuthSuccess,
  } = flow;
  useDesignHandoffImport(ingestFile, showError);

  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden bg-surface p-2.5 text-foreground sm:p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_15%,#eaeff5,transparent_38%)]" />
      </div>

      <div className="ice-panel relative z-10 mx-auto flex min-h-[calc(100dvh-20px)] max-w-[1600px] flex-col overflow-hidden sm:min-h-[calc(100dvh-32px)]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-foreground/10 px-6 py-6 lg:px-10">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/45 transition-colors hover:text-foreground"
            >
              MIST Studio
            </Link>
            <h1 className="mt-3 text-[clamp(3rem,6vw,6rem)] font-light leading-[0.78] tracking-[-0.075em] text-foreground">
              Drop your <strong className="font-semibold">CAD.</strong>
            </h1>
          </div>
          {parsed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={busy}
            >
              Start over
            </Button>
          ) : null}
        </header>

        <div className="grid flex-1 gap-0 lg:grid-cols-[1.35fr_0.65fr]">
          <section className="relative min-h-[420px] overflow-hidden border-b border-foreground/[0.06] bg-muted lg:min-h-[650px] lg:border-b-0 lg:border-r lg:border-foreground/[0.06]">
            {phase === "parsing" ? (
              <UploadParsingState status={parseStatus} />
            ) : (
              <UploadModelViewport
                root={parsed?.preloaded.root ?? null}
                revision={previewRevision}
                slots={slotIds}
                hiddenSlots={hiddenSlots}
                slotTokens={parsed?.modelConfig.slotTokens}
                className="h-full min-h-[420px] lg:min-h-[650px]"
                emptyLabel={
                  phase === "idle"
                    ? "Your model preview will appear here"
                    : "Preview unavailable"
                }
              />
            )}
          </section>

          <aside className="flex flex-col gap-4 bg-surface/28 p-5 lg:p-7">
            {phase === "idle" || phase === "error" ? (
              <>
                <UploadDropPanel
                  busy={busy}
                  onFiles={ingestFiles}
                  onSample={handleSample}
                />
                {error ? (
                  <div
                    className="rounded-xl border border-red-600/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-950"
                    role="alert"
                  >
                    {error}
                    {outOfCredits(error) ? <BuyCreditsLink /> : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {phase === "ready" || phase === "saving" ? (
              <div className="flex flex-col gap-5 rounded-[1.75rem] border border-foreground/[0.06] bg-surface/55 p-5">
                <UploadModelSummary parsed={parsed} />

                {overPolyLimit ? (
                  <UploadPolyLimitNotice
                    polyCount={parsed?.polyCount ?? 0}
                    planLabel={planLabel}
                    maxPolygons={maxPolygons}
                    decimating={decimating}
                    onDecimate={() => void handleDecimate()}
                  />
                ) : null}

                <UploadMetadataForm
                  value={metadata}
                  onChange={(patch) =>
                    setMetadata((prev) => ({ ...prev, ...patch }))
                  }
                  skuError={skuError}
                />

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Layers
                  </p>
                  <div className="mt-3">
                    <UploadLayersEditor
                      layers={layers}
                      onRename={handleRename}
                      onToggleVisibility={handleToggleVisibility}
                    />
                  </div>
                </div>

                {phase === "saving" ? (
                  <div className="space-y-2">
                    <Progress value={saveProgress} />
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {saveMessage ?? "Saving…"}
                    </p>
                  </div>
                ) : null}

                {error ? (
                  <p className="text-sm text-red-700" role="alert">
                    {error}
                    {outOfCredits(error) ? <BuyCreditsLink /> : null}
                  </p>
                ) : null}

                <Button
                  type="button"
                  className="w-full rounded-full bg-foreground py-6 font-mono text-[10px] uppercase tracking-[0.24em] text-background hover:bg-foreground"
                  disabled={busy || overPolyLimit}
                  onClick={() => void handleSave()}
                >
                  Save and open studio ↗
                </Button>
              </div>
            ) : null}
          </aside>
        </div>
      </div>

      <UploadSignInDialog
        open={authDialogOpen}
        onOpenChange={handleAuthDialogOpenChange}
        onSuccess={handleAuthSuccess}
      />
    </main>
  );
}
