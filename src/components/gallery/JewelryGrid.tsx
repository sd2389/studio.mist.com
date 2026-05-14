"use client";

import dynamic from "next/dynamic";
import { JEWELRY } from "@/lib/jewelry/assembly";

const JewelryTile = dynamic(
  () => import("@/components/gallery/JewelryTile").then((m) => m.JewelryTile),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-square animate-pulse rounded-xl border border-border bg-muted/60" />
    ),
  },
);

export function JewelryGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {JEWELRY.map((p) => (
        <JewelryTile key={p.id} id={p.id} label={p.label} description={p.description} />
      ))}
    </div>
  );
}
