"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { formatPolyCount } from "@/lib/upload/count-polygons";
import { useUploadModelFlow } from "@/features/upload/hooks/useUploadModelFlow";
import { UploadDropPanel } from "./UploadDropPanel";
import { UploadLayersEditor } from "./UploadLayersEditor";
import { UploadMetadataForm } from "./UploadMetadataForm";
import { UploadModelViewport } from "./UploadModelViewport";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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
    hiddenSlots,
    slotIds,
    showPolyWarning,
    busy,
    reset,
    ingestFile,
    handleSample,
    handleRename,
    handleToggleVisibility,
    handleDecimate,
    handleSave,
  } = flow;

  return (
    <main className="dark relative isolate min-h-[100dvh] overflow-hidden bg-[#141310] text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -left-24 top-0 size-[520px] rounded-full bg-[#b99b66]/[0.08] blur-[110px]" />
        <div className="absolute -right-32 top-1/3 size-[420px] rounded-full bg-white/[0.035] blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-[1400px] flex-col px-4 py-6 sm:px-6 lg:py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
            >
              DevJewels Studio
            </Link>
            <h1 className="mt-3 font-display text-4xl font-normal italic tracking-[-0.04em] text-white sm:text-5xl">
              Begin a new piece.
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

        <div className="grid flex-1 gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <section className="relative min-h-[420px] overflow-hidden rounded-3xl border border-white/[0.08] bg-[radial-gradient(circle_at_50%_40%,#393630_0%,#201e1a_48%,#151310_100%)] lg:min-h-[560px]">
            {phase === "parsing" ? (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 bg-black/10">
                <Loader2
                  className="size-8 animate-spin text-primary"
                  aria-hidden
                />
                <p className="text-sm font-medium text-foreground">
                  Parsing to glb file…
                </p>
                <p className="max-w-sm text-center text-xs text-muted-foreground">
                  Converting CAD in your browser. Your file stays on-device
                  until you save.
                </p>
              </div>
            ) : (
              <UploadModelViewport
                root={parsed?.preloaded.root ?? null}
                slots={slotIds}
                hiddenSlots={hiddenSlots}
                slotTokens={parsed?.modelConfig.slotTokens}
                className="h-full min-h-[420px] lg:min-h-[560px]"
                emptyLabel={
                  phase === "idle"
                    ? "Your model preview will appear here"
                    : "Preview unavailable"
                }
              />
            )}
          </section>

          <aside className="flex flex-col gap-4">
            {phase === "idle" || phase === "error" ? (
              <>
                <UploadDropPanel
                  busy={busy}
                  onFile={ingestFile}
                  onSample={handleSample}
                />
                {error ? (
                  <div
                    className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                    role="alert"
                  >
                    {error}
                  </div>
                ) : null}
              </>
            ) : null}

            {phase === "ready" || phase === "saving" ? (
              <div className="flex flex-col gap-5 rounded-3xl border border-white/[0.08] bg-[#1d1b18]/90 p-5 shadow-2xl backdrop-blur">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Model details
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {parsed?.file.name} ·{" "}
                    {formatPolyCount(parsed?.polyCount ?? 0)} polys
                  </p>
                </div>

                {showPolyWarning ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    <p>
                      This model has {formatPolyCount(parsed?.polyCount ?? 0)}{" "}
                      polygons — above the recommended 100k limit.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 border-amber-500/40 text-amber-50 hover:bg-amber-500/10"
                      onClick={handleDecimate}
                    >
                      Decimate to ~100k
                    </Button>
                  </div>
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
                  <p className="text-sm text-red-400" role="alert">
                    {error}
                  </p>
                ) : null}

                <Button
                  type="button"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void handleSave()}
                >
                  Save File
                </Button>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
