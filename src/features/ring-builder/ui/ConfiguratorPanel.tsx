"use client";

import {
  getCadGem,
  ringSizeRow,
  formatUsSize,
  stoneSizeForCarat,
  US_RING_SIZE_MAX,
  US_RING_SIZE_MIN,
  US_RING_SIZE_STEP,
  type CadMetalId,
  type JewelryDesign,
} from "@/lib/jewelry-cad";
import {
  BAND_THICKNESS_MAX,
  BAND_THICKNESS_MIN,
  BAND_WIDTH_MAX,
  BAND_WIDTH_MIN,
  TAPER_MAX,
  capabilitiesOf,
  type DesignPatch,
} from "@/features/ring-builder/domain/design-rules";
import {
  BAND_ACCENT_OPTIONS,
  BAND_KIND_OPTIONS,
  CARAT_STEPS,
  GEM_OPTIONS,
  HALO_OPTIONS,
  HEAD_OPTIONS,
  METAL_OPTIONS,
  PROFILE_OPTIONS,
  nearestCaratStep,
} from "@/features/ring-builder/domain/design-options";
import { ChipGroup, Section, SliderField, SwatchPicker, ToggleField } from "@/features/ring-builder/ui/controls";
import { CutPicker } from "@/features/ring-builder/ui/CutPicker";

type PanelProps = { design: JewelryDesign; onChange: (patch: DesignPatch) => void };

function caratReadout(design: JewelryDesign): string {
  const size = stoneSizeForCarat(design.cut, design.carat, getCadGem(design.gem).sizingGravity);
  const mm = design.cut === "round" ? `${size.length.toFixed(1)} mm` : `${size.length.toFixed(1)} × ${size.width.toFixed(1)} mm`;
  return `${design.carat.toFixed(2)} ct · ${mm}`;
}

function StoneSection({ design, onChange, index }: PanelProps & { index: string }) {
  const caps = capabilitiesOf(design);
  return (
    <Section index={index} title="Stone" aside={caratReadout(design)}>
      <CutPicker value={design.cut} onChange={(cut) => onChange({ cut })} />
      <SliderField
        label="Carat"
        value={nearestCaratStep(design.carat)}
        display={`${design.carat.toFixed(2)} ct`}
        min={0}
        max={CARAT_STEPS.length - 1}
        step={1}
        onChange={(i) => onChange({ carat: CARAT_STEPS[i]! })}
      />
      <SwatchPicker label="Stone" options={GEM_OPTIONS} value={design.gem} onChange={(gem) => onChange({ gem })} />
      {caps.hasAccentStones ? (
        <SwatchPicker label="Accent stones" options={GEM_OPTIONS} value={design.accentGem} onChange={(accentGem) => onChange({ accentGem })} />
      ) : null}
    </Section>
  );
}

function MetalSection({ design, onChange, index }: PanelProps & { index: string }) {
  const caps = capabilitiesOf(design);
  const band = METAL_OPTIONS.find((m) => m.value === design.metal);
  const headOptions = [{ value: "match" as const, label: `Match band (${band?.label ?? "metal"})`, name: "Match band", presetId: design.metal }, ...METAL_OPTIONS];
  return (
    <Section index={index} title="Metal" aside={METAL_OPTIONS.find((m) => m.value === design.metal)?.full}>
      <SwatchPicker label={caps.isRing ? "Band metal" : "Metal"} options={METAL_OPTIONS} value={design.metal} onChange={(metal) => onChange({ metal })} />
      {caps.hasSetting ? (
        <SwatchPicker<CadMetalId | "match">
          label="Prong & head metal"
         
          options={headOptions}
          value={design.headMetal}
          onChange={(headMetal) => onChange({ headMetal })}
        />
      ) : null}
    </Section>
  );
}

function SettingSection({ design, onChange, index }: PanelProps & { index: string }) {
  const caps = capabilitiesOf(design);
  return (
    <Section index={index} title="Setting">
      <ChipGroup label="Head" options={HEAD_OPTIONS} value={design.head} onChange={(head) => onChange({ head })} columns={4} />
      <ChipGroup label="Halo" options={HALO_OPTIONS} value={design.halo} onChange={(halo) => onChange({ halo })} />
      {caps.hasBandStones ? (
        <>
          <ChipGroup label="Band stones" options={BAND_ACCENT_OPTIONS} value={design.bandStones} onChange={(bandStones) => onChange({ bandStones })} />
          <ToggleField label="Side stones" hint="Three-stone: a matched stone either side" checked={design.sideStones} onChange={(sideStones) => onChange({ sideStones })} />
        </>
      ) : null}
    </Section>
  );
}

function BandSection({ design, onChange, index }: PanelProps & { index: string }) {
  const caps = capabilitiesOf(design);
  return (
    <Section index={index} title="Band" aside={`${design.bandWidth.toFixed(1)} × ${design.bandThickness.toFixed(1)} mm`}>
      {!caps.hasCenter ? (
        <ChipGroup label="Stones" options={BAND_KIND_OPTIONS} value={design.bandStones} onChange={(bandStones) => onChange({ bandStones })} />
      ) : null}
      <ChipGroup label="Profile" options={PROFILE_OPTIONS} value={design.profile} onChange={(profile) => onChange({ profile })} columns={4} />
      <SliderField label="Width" value={design.bandWidth} display={`${design.bandWidth.toFixed(1)} mm`} min={BAND_WIDTH_MIN} max={BAND_WIDTH_MAX} step={0.1} onChange={(bandWidth) => onChange({ bandWidth })} />
      <SliderField label="Thickness" value={design.bandThickness} display={`${design.bandThickness.toFixed(1)} mm`} min={BAND_THICKNESS_MIN} max={BAND_THICKNESS_MAX} step={0.1} onChange={(bandThickness) => onChange({ bandThickness })} />
      {caps.canTaper ? (
        <SliderField label="Taper to head" value={design.taper} display={design.taper === 0 ? "Straight" : `${Math.round(design.taper * 100)}%`} min={0} max={TAPER_MAX} step={0.05} onChange={(taper) => onChange({ taper })} />
      ) : null}
      {caps.hasCenter ? (
        <ToggleField label="Cathedral shoulders" hint="Arches rise from the band to the head" checked={design.cathedral} disabled={!caps.canCathedral} onChange={(cathedral) => onChange({ cathedral })} />
      ) : null}
    </Section>
  );
}

function SizeSection({ design, onChange, index }: PanelProps & { index: string }) {
  const row = ringSizeRow(design.ringSize);
  return (
    <Section index={index} title="Ring size" aside={`EU ${row.eu}`}>
      <SliderField
        label="US size"
        value={design.ringSize}
        display={`US ${formatUsSize(design.ringSize)} · Ø ${row.diameterMm.toFixed(2)} mm`}
        min={US_RING_SIZE_MIN}
        max={US_RING_SIZE_MAX}
        step={US_RING_SIZE_STEP}
        onChange={(ringSize) => onChange({ ringSize })}
      />
    </Section>
  );
}

/** Every configurator section that applies to the current piece, numbered in order. */
export function ConfiguratorPanel({ design, onChange }: PanelProps) {
  const caps = capabilitiesOf(design);
  const sections: Array<(index: string) => React.ReactNode> = [];
  if (caps.hasCenter) sections.push((i) => <StoneSection key="stone" index={i} design={design} onChange={onChange} />);
  if (!caps.hasCenter && design.bandStones !== "none") {
    sections.push((i) => (
      <Section key="stones" index={i} title="Stones">
        <SwatchPicker label="Stone" options={GEM_OPTIONS} value={design.gem} onChange={(gem) => onChange({ gem })} />
      </Section>
    ));
  }
  sections.push((i) => <MetalSection key="metal" index={i} design={design} onChange={onChange} />);
  if (caps.hasSetting) sections.push((i) => <SettingSection key="setting" index={i} design={design} onChange={onChange} />);
  if (caps.hasBand) sections.push((i) => <BandSection key="band" index={i} design={design} onChange={onChange} />);
  if (caps.hasSizes) sections.push((i) => <SizeSection key="size" index={i} design={design} onChange={onChange} />);
  return <div className="space-y-3">{sections.map((render, i) => render(String(i + 2).padStart(2, "0")))}</div>;
}
