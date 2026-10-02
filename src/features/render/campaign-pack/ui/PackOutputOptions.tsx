"use client";

import type { ExportBackdrop } from "@/lib/export-backdrop";
import { ASET_LEGEND, PACK_STILL_SIZES, TURNTABLE_FORMAT_ORDER, TURNTABLE_FORMATS } from "../domain/defaults";
import type { CampaignPackConfig, PackBackground, TurntableFormatId } from "../domain/types";
import { JpegQualityField } from "../../ui/JpegQualityField";
import { PackSection, ToggleRow } from "./pack-ui";
import { Chip } from "@/components/ui/chip";

type OptionsProps = {
  config: CampaignPackConfig;
  onChange: (next: CampaignPackConfig) => void;
  sceneBackdrop: ExportBackdrop | null;
  hasSku: boolean;
  hasTracedGems: boolean;
  disabled?: boolean;
};

function backdropSwatch(backdrop: ExportBackdrop | null): string | undefined {
  if (!backdrop) return undefined;
  if (backdrop.kind === "color") return backdrop.color;
  if (backdrop.kind === "image") return backdrop.fallbackColor;
  return backdrop.stops[0]?.color;
}

function BackgroundPicker({ config, onChange, sceneBackdrop, disabled }: OptionsProps) {
  const setBackground = (background: PackBackground) => onChange({ ...config, background });
  const custom = config.background.kind === "custom" ? config.background.color : "#f4f2ee";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip selected={config.background.kind === "white"} onClick={() => setBackground({ kind: "white" })} swatch="#ffffff" disabled={disabled}>
        Pure white
      </Chip>
      <Chip
        selected={config.background.kind === "scene"}
        onClick={() => setBackground({ kind: "scene" })}
        swatch={backdropSwatch(sceneBackdrop)}
        disabled={disabled || !sceneBackdrop}
        title={sceneBackdrop ? "The studio background and set you see now" : "No scene background to reuse"}
      >
        Studio scene
      </Chip>
      <label className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-xs">
        <input
          type="color"
          value={custom}
          disabled={disabled}
          aria-label="Custom background colour"
          onChange={(event) => setBackground({ kind: "custom", color: event.target.value })}
          className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
        />
        <span className={config.background.kind === "custom" ? "font-semibold" : "text-muted-foreground"}>Custom</span>
      </label>
    </div>
  );
}

function StillOptions(props: OptionsProps) {
  const { config, onChange, disabled } = props;
  return (
    <PackSection title="Stills" aside="square, every metal × angle">
      <div className="flex flex-wrap gap-1.5">
        {PACK_STILL_SIZES.map((size) => (
          <Chip key={size} selected={config.stillSize === size} onClick={() => onChange({ ...config, stillSize: size })} disabled={disabled}>
            {size}×{size}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip
          selected={config.formats.jpg}
          onClick={() => onChange({ ...config, formats: { ...config.formats, jpg: !config.formats.jpg } })}
          disabled={disabled}
        >
          JPG on clean background
        </Chip>
        <Chip
          selected={config.formats.png}
          onClick={() => onChange({ ...config, formats: { ...config.formats, png: !config.formats.png } })}
          disabled={disabled}
        >
          Transparent PNG
        </Chip>
      </div>
      <BackgroundPicker {...props} />
      <div className="grid gap-2 sm:grid-cols-2">
        <JpegQualityField
          value={config.jpegQuality}
          min={80}
          disabled={disabled}
          onChange={(jpegQuality) => onChange({ ...config, jpegQuality })}
          className="bg-background/60"
        />
        <label
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs"
          title="Soft ground shadow in JPGs, spins and videos. Transparent PNGs are always the piece alone."
        >
          <span>Contact shadow (JPG &amp; video)</span>
          <input
            type="checkbox"
            checked={config.contactShadow}
            disabled={disabled}
            onChange={(event) => onChange({ ...config, contactShadow: event.target.checked })}
            className="size-4 accent-foreground"
          />
        </label>
      </div>
      <ToggleRow
        id="pack-autoframe"
        label="Auto-frame every shot"
        hint="Fits the piece with an even margin and centres it; off uses the studio camera."
        checked={config.autoFrame}
        onCheckedChange={(autoFrame) => onChange({ ...config, autoFrame })}
        disabled={disabled}
      >
        <label className="flex items-center gap-3 text-xs">
          <span className="w-14 text-muted-foreground">Margin</span>
          <input
            type="range"
            min={0}
            max={20}
            value={config.marginPct}
            disabled={disabled}
            onChange={(event) => onChange({ ...config, marginPct: Number(event.target.value) })}
            className="flex-1 accent-foreground"
          />
          <span className="w-8 text-right tabular-nums">{config.marginPct}%</span>
        </label>
      </ToggleRow>
    </PackSection>
  );
}

function toggleFormat(formats: TurntableFormatId[], format: TurntableFormatId): TurntableFormatId[] {
  return formats.includes(format) ? formats.filter((item) => item !== format) : [...formats, format];
}

function MotionOptions({ config, onChange, hasSku, hasTracedGems, disabled }: OptionsProps) {
  const { turntable, spin } = config;
  return (
    <PackSection title="Motion & web">
      <ToggleRow
        id="pack-turntable"
        label={`360° turntable MP4 · ${turntable.durationSec}s`}
        hint={`H.264, ${turntable.fps} fps, seamless loop — one per metal and format.`}
        checked={turntable.enabled}
        onCheckedChange={(enabled) => onChange({ ...config, turntable: { ...turntable, enabled } })}
        disabled={disabled}
      >
        <div className="flex flex-wrap gap-1.5">
          {TURNTABLE_FORMAT_ORDER.map((format) => (
            <Chip
              key={format}
              selected={turntable.formats.includes(format)}
              onClick={() => onChange({ ...config, turntable: { ...turntable, formats: toggleFormat(turntable.formats, format) } })}
              disabled={disabled}
              title={TURNTABLE_FORMATS[format].hint}
            >
              {TURNTABLE_FORMATS[format].label}
              <span className="font-normal opacity-70"> · {TURNTABLE_FORMATS[format].hint}</span>
            </Chip>
          ))}
        </div>
      </ToggleRow>
      <ToggleRow
        id="pack-spin"
        label={`360° spin · ${spin.frames} frames`}
        hint={`${spin.size}×${spin.size} JPG sequence per metal + spin.html (drag, scroll, touch; works offline).`}
        checked={spin.enabled}
        onCheckedChange={(enabled) => onChange({ ...config, spin: { ...spin, enabled } })}
        disabled={disabled}
      />
      <ToggleRow
        id="pack-scope"
        label="ASET cut-quality scope"
        hint={
          hasTracedGems
            ? `Top view of the stones in gem-lab false colour: ${ASET_LEGEND}.`
            : "Needs a ray-traced gem on the piece."
        }
        checked={config.cutScope && hasTracedGems}
        onCheckedChange={(cutScope) => onChange({ ...config, cutScope })}
        disabled={disabled || !hasTracedGems}
      />
      <ToggleRow
        id="pack-embed"
        label="Live 3D embed snippet"
        hint={hasSku ? "embed.html preview + iframe code for your product page." : "Set a SKU on this model to include the embed."}
        checked={config.embed && hasSku}
        onCheckedChange={(embed) => onChange({ ...config, embed })}
        disabled={disabled || !hasSku}
      />
    </PackSection>
  );
}

export function PackOutputOptions(props: OptionsProps) {
  return (
    <>
      <StillOptions {...props} />
      <MotionOptions {...props} />
    </>
  );
}
