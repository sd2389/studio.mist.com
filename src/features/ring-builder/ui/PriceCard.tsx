"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getCadGem, type CadGemId, type JewelrySpecs } from "@/lib/jewelry-cad";
import { DEFAULT_PRICING_RULES, quoteDesign, type MetalFamily, type PricingRules } from "@/lib/pricing/quote";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "mist.pricing-rules.v1";
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Rates are a per-device convenience for now; an unreadable store falls back to the defaults. */
function loadRules(): PricingRules {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRICING_RULES;
    const saved = JSON.parse(raw) as Partial<PricingRules>;
    return {
      ...DEFAULT_PRICING_RULES,
      ...saved,
      spotPerGram: { ...DEFAULT_PRICING_RULES.spotPerGram, ...saved.spotPerGram },
      stonePerCarat: { ...DEFAULT_PRICING_RULES.stonePerCarat, ...saved.stonePerCarat },
    };
  } catch {
    return DEFAULT_PRICING_RULES;
  }
}

// One shared copy of the rates, so every price card on the page agrees.
let current: PricingRules | null = null;
const listeners = new Set<() => void>();

function readRules(): PricingRules {
  current ??= loadRules();
  return current;
}

function writeRules(rules: PricingRules): void {
  current = rules;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* private mode: rates last for this visit */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function RateField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] text-foreground/70">
      <span className="min-w-0 truncate">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={value}
        onChange={(e) => {
          const next = Number.parseFloat(e.target.value);
          if (Number.isFinite(next) && next >= 0) onChange(next);
        }}
        className="w-24 rounded-md border border-foreground/10 bg-surface px-2 py-1 text-right tabular-nums text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-holo/40"
      />
    </label>
  );
}

const SPOT_LABELS: Record<MetalFamily, string> = { gold: "Gold, $/g pure", platinum: "Platinum, $/g pure", silver: "Silver, $/g pure" };

/** Live retail estimate with its breakdown, priced from the jeweler's own rates. */
export function PriceCard({ specs, busy, className }: { specs: JewelrySpecs; busy?: boolean; className?: string }) {
  // The server and the first paint use the starting rates; stored ones apply right after.
  const rules = useSyncExternalStore(subscribe, readRules, () => DEFAULT_PRICING_RULES);
  const update = writeRules;
  const quote = useMemo(() => quoteDesign(specs, rules), [specs, rules]);
  const gems = [...new Set(specs.stones.map((s) => s.gem))] as CadGemId[];

  return (
    <section className={cn("rounded-[1.6rem] border border-foreground/[0.06] bg-surface/75 p-4 backdrop-blur sm:p-5", className)} aria-live="polite">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[15px] tracking-[-0.02em] text-foreground">Price estimate</h2>
        <span className={cn("font-mono text-[10px] uppercase tracking-[0.24em] transition-opacity", busy ? "text-holo opacity-100" : "opacity-0")}>
          Updating
        </span>
      </header>
      <p className="mt-3 text-[34px] font-light leading-none tracking-[-0.04em] text-foreground tabular-nums">{usd.format(quote.retail)}</p>
      <p className="mt-1.5 text-[11px] tabular-nums text-foreground/45">
        Cost {usd.format(quote.cost)} · markup ×{rules.markup.toFixed(2)}
      </p>
      <ul className="mt-3 divide-y divide-foreground/[0.06] border-t border-foreground/[0.06]">
        {quote.lines.map((line, i) => (
          <li key={`${line.label}-${i}`} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block text-[12px] text-foreground">{line.label}</span>
              <span className="block truncate text-[11px] text-foreground/45">{line.detail}</span>
            </span>
            <span className="shrink-0 text-[12px] tabular-nums text-foreground">{usd.format(line.amount)}</span>
          </li>
        ))}
      </ul>
      <details className="group mt-2 border-t border-foreground/[0.06] pt-2.5">
        <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/40 marker:hidden">
          Your rates <span className="text-foreground/30 group-open:hidden">+</span>
        </summary>
        <div className="mt-3 space-y-2">
          {(Object.keys(SPOT_LABELS) as MetalFamily[]).map((family) => (
            <RateField
              key={family}
              label={SPOT_LABELS[family]}
              value={rules.spotPerGram[family]}
              step={0.5}
              onChange={(v) => update({ ...rules, spotPerGram: { ...rules.spotPerGram, [family]: v } })}
            />
          ))}
          {gems.map((gem) => (
            <RateField
              key={gem}
              label={`${getCadGem(gem).label}, $/ct at 1 ct`}
              value={rules.stonePerCarat[gem]}
              step={50}
              onChange={(v) => update({ ...rules, stonePerCarat: { ...rules.stonePerCarat, [gem]: v } })}
            />
          ))}
          <RateField label="Casting loss, %" value={Math.round(rules.castingLoss * 100)} step={1} onChange={(v) => update({ ...rules, castingLoss: v / 100 })} />
          <RateField label="Bench work, $" value={rules.benchLabour} step={5} onChange={(v) => update({ ...rules, benchLabour: v })} />
          <RateField label="Setting, centre stone $" value={rules.settingCentre} step={5} onChange={(v) => update({ ...rules, settingCentre: v })} />
          <RateField label="Setting, each accent $" value={rules.settingAccent} step={0.5} onChange={(v) => update({ ...rules, settingAccent: v })} />
          <RateField label="Markup, ×" value={rules.markup} step={0.05} onChange={(v) => update({ ...rules, markup: v })} />
          <div className="flex items-center justify-between pt-1">
            <p className="text-[10px] text-foreground/40">Saved on this device. Starting rates are indicative, not market prices.</p>
            <button
              type="button"
              onClick={() => update(DEFAULT_PRICING_RULES)}
              className="shrink-0 text-[11px] text-holo underline-offset-4 hover:underline"
            >
              Reset
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}
