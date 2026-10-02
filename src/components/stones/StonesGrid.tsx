"use client";

import dynamic from "next/dynamic";
import { CUT_GROUPS, STANDARD_CUTS } from "@/lib/stones/cut-geometries";

const StoneTile = dynamic(
  () => import("@/components/stones/StoneTile").then((m) => m.StoneTile),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-square animate-pulse rounded-[24px] border border-hairline bg-surface" />
    ),
  },
);

export function StonesGrid() {
  return (
    <div className="space-y-10">
      {CUT_GROUPS.map((group) => (
        <section key={group.id} aria-labelledby={`cuts-${group.id}`}>
          <h2
            id={`cuts-${group.id}`}
            className="mb-5 flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.3em] text-holo before:h-px before:w-7 before:bg-current"
          >
            {group.label}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STANDARD_CUTS.filter((cut) => cut.group === group.id).map(
              (cut) => (
                <StoneTile
                  key={cut.id}
                  cutId={cut.id}
                  label={cut.label}
                  description={cut.description}
                />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
