"use client";

import dynamic from "next/dynamic";
import { STANDARD_CUTS } from "@/lib/stones/cut-geometries";

const StoneTile = dynamic(
  () => import("@/components/stones/StoneTile").then((m) => m.StoneTile),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-square animate-pulse rounded-xl border border-border bg-muted/60" />
    ),
  },
);

export function StonesGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {STANDARD_CUTS.map((cut) => (
        <StoneTile
          key={cut.id}
          cutId={cut.id}
          label={cut.label}
          description={cut.description}
        />
      ))}
    </div>
  );
}
