"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { formatPolyCount } from "@/lib/upload/count-polygons";
import { useUploadModelFlow } from "@/features/upload/hooks/useUploadModelFlow";
import { UploadDropPanel } from "./UploadDropPanel";
import { UploadLayersEditor } from "./UploadLayersEditor";
import { UploadMetadataForm } from "./UploadMetadataForm";
import { UploadModelViewport } from "./UploadModelViewport";
import { UploadSignInDialog } from "./UploadSignInDialog";
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
    authDialogOpen,
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
    handleAuthDialogOpenChange,
    handleAuthSuccess,
  } = flow;

  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden bg-white p-2.5 text-[#212121] sm:p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_15%,#eaeff5,transparent_38%)]" />
      </div>

      <div className="ice-panel relative z-10 mx-auto flex min-h-[calc(100dvh-20px)] max-w-[1600px] flex-col overflow-hidden sm:min-h-[calc(100dvh-32px)]">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-black/10 px-6 py-6 lg:px-10">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex text-[9px] uppercase tracking-[0.14em] text-black/45 transition-colors hover:text-black"
            >
              DevJewels Studio
            </Link>
            <h1 className="mt-3 text-[clamp(3rem,6vw,6rem)] font-light leading-[0.78] tracking-[-0.075em] text-black">
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
          <section className="relative min-h-[420px] overflow-hidden border-b border-black/10 bg-[radial-gradient(circle_at_50%_40%,#ffffff_0%,#e3eaf2_52%,#cbd7e4_100%)] lg:min-h-[650px] lg:border-b-0 lg:border-r lg:border-black/10">
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

          <aside className="flex flex-col gap-4 bg-white/28 p-5 lg:p-7">
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
              <div className="flex flex-col gap-5 rounded-[1.75rem] border border-black/[0.06] bg-white/55 p-5">
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
                  className="w-full rounded-full bg-[#212121] py-6 text-[10px] font-semibold uppercase tracking-[0.1em] text-white hover:bg-black"
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

      <UploadSignInDialog
        open={authDialogOpen}
        onOpenChange={handleAuthDialogOpenChange}
        onSuccess={handleAuthSuccess}
      />
    </main>
  );
}
