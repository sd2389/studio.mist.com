"use client";

import { useCallback, useState } from "react";
import { getPreset, type JewelryDesign, type PresetId } from "@/lib/jewelry-cad";
import { applyPatch, capabilitiesOf, describeDesign, designFileStem, switchPreset, type DesignPatch } from "@/features/ring-builder/domain/design-rules";
import type { PreviewView } from "@/features/ring-builder/domain/preview-views";
import { ConfiguratorPanel } from "@/features/ring-builder/ui/ConfiguratorPanel";
import { Section } from "@/features/ring-builder/ui/controls";
import { DesignerHeader } from "@/features/ring-builder/ui/DesignerHeader";
import { DownloadsCard } from "@/features/ring-builder/ui/DownloadsCard";
import { PreviewPanel } from "@/features/ring-builder/ui/PreviewPanel";
import { PriceCard } from "@/features/ring-builder/ui/PriceCard";
import { SpecsCard } from "@/features/ring-builder/ui/SpecsCard";
import { StylePicker } from "@/features/ring-builder/ui/StylePicker";
import { useDesignActions } from "@/features/ring-builder/ui/useDesignActions";
import { useJewelryBuild } from "@/features/ring-builder/ui/useJewelryBuild";

export type DesignerPageProps = { initialPreset: PresetId; initialView: PreviewView };

/** /design: configure a piece, watch it rebuild live, take the files or open it in the studio. */
export function DesignerPage({ initialPreset, initialView }: DesignerPageProps) {
  const [presetId, setPresetId] = useState<PresetId>(initialPreset);
  const [design, setDesign] = useState<JewelryDesign>(() => switchPreset(null, initialPreset));
  const [view, setView] = useState<PreviewView>(initialView);
  const [viewNonce, setViewNonce] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [includeStones, setIncludeStones] = useState(false);
  const { build, building, error, buildSizesZip } = useJewelryBuild(design);
  const actions = useDesignActions({
    parts: build?.parts ?? null,
    fileStem: designFileStem(design, presetId),
    includeStones,
    buildSizesZip,
  });

  const choosePreset = useCallback((id: PresetId) => {
    setPresetId(id);
    setDesign((current) => switchPreset(current, id));
  }, []);
  const change = useCallback((patch: DesignPatch) => setDesign((current) => applyPatch(current, patch)), []);
  const chooseView = useCallback((v: PreviewView) => {
    setView(v);
    setViewNonce((n) => n + 1);
  }, []);

  const caps = capabilitiesOf(design);
  const ready = Boolean(build) && !building;
  const specs = build?.specs ?? null;

  return (
    <div className="min-h-[100dvh] bg-app-canvas text-foreground">
      <DesignerHeader onOpenInStudio={actions.openInStudio} disabled={!ready || actions.busy !== null} />
      <main className="mx-auto grid max-w-[1640px] gap-3 px-3 pb-10 sm:px-4 lg:grid-cols-[minmax(0,1fr)_minmax(380px,452px)] lg:px-6">
        <div className="lg:sticky lg:top-3 lg:self-start">
          <PreviewPanel
            title={getPreset(presetId).label}
            summary={describeDesign(design)}
            parts={build?.parts ?? null}
            specs={specs}
            kind={design.kind}
            hasCenterStone={design.centerStone}
            building={building}
            error={error}
            view={view}
            viewNonce={viewNonce}
            onView={chooseView}
            autoRotate={autoRotate}
            onAutoRotate={setAutoRotate}
            className="h-[min(calc(100vw+84px),640px)] sm:h-[600px] lg:h-[calc(100dvh-96px)] lg:min-h-[560px]"
          />
        </div>
        <div className="min-w-0 space-y-3">
          <Section index="01" title="Style" aside={getPreset(presetId).description}>
            <StylePicker value={presetId} onChange={choosePreset} />
          </Section>
          <ConfiguratorPanel design={design} onChange={change} />
          {specs ? <PriceCard specs={specs} busy={building} /> : null}
          {specs ? <SpecsCard specs={specs} busy={building} /> : null}
          <DownloadsCard
            ready={ready}
            isRing={caps.isRing}
            busy={actions.busy}
            progress={actions.progress}
            error={actions.error}
            includeStones={includeStones}
            onIncludeStones={setIncludeStones}
            onDownload={actions.download}
            onOpenInStudio={actions.openInStudio}
          />
        </div>
      </main>
    </div>
  );
}
