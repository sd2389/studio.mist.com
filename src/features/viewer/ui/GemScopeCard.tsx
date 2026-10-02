"use client";

import { Switch } from "@/components/ui/switch";
import { useGemScopeStore } from "@/stores/gem-scope-store";

const LEGEND = [
  { color: "#F2100D", label: "Bright light", detail: "45–75° — the light that makes brilliance" },
  { color: "#0DBF1F", label: "Low light", detail: "0–45° — softer contrast" },
  { color: "#1433FF", label: "Obstruction", detail: "the viewer's own shadow — pattern contrast" },
  { color: "#EBEBEB", label: "Leakage", detail: "light escaping through the pavilion" },
] as const;

/** ASET cut-quality scope: shows where each facet's light comes from, as gem labs do. */
export function GemScopeCard() {
  const enabled = useGemScopeStore((s) => s.mode === "aset");
  const setMode = useGemScopeStore((s) => s.setMode);
  return (
    <section className="shrink-0 border-t border-border/60 px-5 py-4">
      <label className="flex items-center justify-between gap-3">
        <span>
          <span className="block text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">
            Cut scope (ASET)
          </span>
          <span className="block text-[10px] text-muted-foreground">Judge light return like a gem lab</span>
        </span>
        <Switch checked={enabled} onCheckedChange={(checked) => setMode(checked ? "aset" : "off")} />
      </label>
      {enabled ? (
        <ul className="mt-3 grid gap-1.5">
          {LEGEND.map((entry) => (
            <li key={entry.label} className="flex items-start gap-2 text-[10px] leading-4 text-foreground/75">
              <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
              <span>
                <span className="font-medium text-foreground">{entry.label}</span> · {entry.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
