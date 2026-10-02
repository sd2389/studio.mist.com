"use client";

import { formatUsSize, getCadCut, getCadGem, getCadMetal, type JewelrySpecs, type StoneGroupSpec } from "@/lib/jewelry-cad";
import { cn } from "@/lib/utils";

/** Live spec sheet: weight per metal, stones and carats, dimensions, sizing. */

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 border-t border-foreground/[0.06] pt-2.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/40">{label}</dt>
      <dd className="mt-1 truncate text-[13px] tabular-nums tracking-[-0.01em] text-foreground">{value}</dd>
      {sub ? <dd className="truncate text-[11px] tabular-nums text-foreground/45">{sub}</dd> : null}
    </div>
  );
}

function stoneLine(s: StoneGroupSpec): { value: string; sub: string } {
  const cut = getCadCut(s.cut).label;
  const size = s.lengthMm === s.widthMm ? `${s.lengthMm.toFixed(1)} mm` : `${s.lengthMm.toFixed(1)} × ${s.widthMm.toFixed(1)} mm`;
  if (s.count === 1) return { value: `${s.caratEach.toFixed(2)} ct ${cut}`, sub: `${getCadGem(s.gem).label} · ${size}` };
  return { value: `${s.count} × ${s.caratEach.toFixed(3)} ct`, sub: `${cut} ${getCadGem(s.gem).label.toLowerCase()} · ${size}` };
}

export function SpecsCard({ specs, className, busy }: { specs: JewelrySpecs; className?: string; busy?: boolean }) {
  const metal = specs.metals.map((m) => `${m.grams.toFixed(2)} g ${getCadMetal(m.metal).shortLabel}`);
  const ring = specs.ring;
  return (
    <section className={cn("rounded-[1.6rem] border border-foreground/[0.06] bg-surface/75 p-4 backdrop-blur sm:p-5", className)} aria-live="polite">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[15px] tracking-[-0.02em] text-foreground">Specifications</h2>
        <span className={cn("font-mono text-[10px] uppercase tracking-[0.24em] transition-opacity", busy ? "text-holo opacity-100" : "opacity-0")}>
          Updating
        </span>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Row label="Metal weight" value={`${specs.metalGrams.toFixed(2)} g`} sub={metal.join(" · ")} />
        <Row label="Total carat" value={`${specs.totalCarat.toFixed(2)} ctw`} sub={`${specs.stoneCount} stone${specs.stoneCount === 1 ? "" : "s"}`} />
        {specs.stones.map((s) => {
          const line = stoneLine(s);
          return <Row key={`${s.slot}-${s.label}`} label={s.label} value={line.value} sub={line.sub} />;
        })}
        {ring ? (
          <>
            <Row label="Ring size" value={`US ${formatUsSize(ring.usSize)} · EU ${ring.eu}`} sub={`Ø ${ring.innerDiameterMm.toFixed(2)} mm inside`} />
            <Row label="Band" value={`${ring.bandWidthMm.toFixed(1)} × ${ring.bandThicknessMm.toFixed(1)} mm`} sub={`Setting height ${ring.settingHeightMm.toFixed(1)} mm`} />
          </>
        ) : null}
        <Row label="Overall" value={`${specs.sizeMm.x.toFixed(1)} × ${specs.sizeMm.y.toFixed(1)} × ${specs.sizeMm.z.toFixed(1)} mm`} sub={`${specs.metalVolumeMm3.toFixed(0)} mm³ metal`} />
      </dl>
      <details className="group mt-3 border-t border-foreground/[0.06] pt-2.5">
        <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/40 marker:hidden">
          Weight in every metal <span className="text-foreground/30 group-open:hidden">+</span>
        </summary>
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] tabular-nums text-foreground/70">
          {specs.weightsByMetal.map((w) => (
            <li key={w.metal} className="flex justify-between gap-2">
              <span className="truncate">{getCadMetal(w.metal).label}</span>
              <span>{w.grams.toFixed(2)} g</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
