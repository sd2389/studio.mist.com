"use client";

import Link from "next/link";
import { getCutById, type CutId } from "@/lib/stones/cut-geometries";
import { LiveStone } from "./LiveStone";

type StoneTileProps = { cutId: CutId; label: string; description: string };

export function StoneTile({ cutId, label, description }: StoneTileProps) {
  if (!getCutById(cutId)) return null;
  return (
    <Link
      href={`/stones/${cutId}`}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open ${label} in studio`}
    >
      <article className="overflow-hidden rounded-[24px] border border-hairline bg-surface transition-colors duration-300 group-hover:border-holo/50">
        <LiveStone cutId={cutId} className="aspect-square">
          <span className="absolute left-4 top-4 z-10 font-mono text-[10px] uppercase tracking-[0.3em] text-faint">Precision cut</span>
        </LiveStone>
        <div className="space-y-2 p-5">
          <p className="font-display text-[26px] font-light tracking-[-0.04em] text-foreground">{label}</p>
          <p className="line-clamp-2 text-[13px] leading-5 text-dim">{description}</p>
        </div>
      </article>
    </Link>
  );
}
