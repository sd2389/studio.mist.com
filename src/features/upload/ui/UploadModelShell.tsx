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
    <main className="dark relative isolate min-h-[100dvh] overflow-hidden bg-[#0b0b0a] text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="cinematic-grain absolute inset-0 opacity-15" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-[1600px] flex-col px-4 py-5 sm:px-7">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-white/20 pb-5">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex text-[9px] font-black uppercase tracking-[0.2em] text-[#ef5b2a] transition-colors hover:text-white"
            >
              DevJewels Studio
            </Link>
            <h1 className="mt-3 text-[clamp(3rem,6vw,6rem)] font-black uppercase leading-[0.78] tracking-[-0.075em] text-white">
              Drop your <span className="text-[#ef5b2a]">CAD.</span>
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

        <div className="grid flex-1 gap-0 border border-white/20 lg:grid-cols-[1.35fr_0.65fr]">
          <section className="relative min-h-[420px] overflow-hidden border-b border-white/20 bg-[radial-gradient(circle_at_50%_40%,#393630_0%,#201e1a_48%,#0b0b0a_100%)] lg:min-h-[650px] lg:border-b-0 lg:border-r">
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

          <aside className="flex flex-col gap-4 bg-[#10100f] p-5">
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
              <div className="flex flex-col gap-5 border border-white/20 bg-[#10100f] p-5">
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
                  className="w-full rounded-none bg-[#ef5b2a] py-6 text-[10px] font-black uppercase tracking-[0.15em] text-black hover:bg-[#ef5b2a]/90"
                  disabled={busy}
                  onClick={() => void handleSave()}
                >
                  Save and open studio ↗
                </Button>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
