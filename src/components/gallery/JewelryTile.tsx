"use client";

import { ArrowUpRight, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { applyGalleryMaterials } from "@/components/gallery/gallery-materials";
import { useFilmTheme } from "@/components/scroll-film/film-theme";
import { StudioCanvas } from "@/features/viewer";
import { useNearViewport } from "@/lib/use-near-viewport";
import { LIGHTING_PRESETS, siteLighting } from "@/lib/viewer-lighting";
import { designerHref, getJewelryById, type JewelryId } from "@/lib/jewelry/assembly";

type Props = { id: JewelryId; label: string; description: string };

export function JewelryTile({ id, label, description }: Props) {
  const piece = getJewelryById(id);
  const root = useMemo(() => (piece ? piece.build() : null), [piece]);

  useEffect(() => {
    if (root) applyGalleryMaterials(root);
  }, [root]);
  const frameRef = useRef<HTMLDivElement>(null);
  const live = useNearViewport(frameRef);
  const lighting = siteLighting(useFilmTheme());

  if (!piece || !root) return null;

  return (
    <article className="group relative overflow-hidden rounded-[24px] border border-hairline bg-surface transition-colors duration-300 hover:border-holo/50">
      <div ref={frameRef} className="relative aspect-square overflow-hidden" style={{ backgroundColor: LIGHTING_PRESETS[lighting].gemBackground }}>
        <span className="absolute left-4 top-4 z-10 font-mono text-[10px] uppercase tracking-[0.24em] text-faint">Live 3D · CAD</span>
        {live ? (
          <StudioCanvas tile lighting={lighting} autoRotate camera={{ position: [1.6, 0.9, 1.6], fov: 38 }}>
            <primitive object={root} />
          </StudioCanvas>
        ) : null}
      </div>
      <div className="space-y-2 p-5">
        <h2 className="font-display text-[26px] font-light tracking-[-0.04em] text-foreground">
          {/* Stretched link: the whole card opens the studio view. */}
          <Link href={`/gallery/${id}`} className="after:absolute after:inset-0 focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
            {label}
          </Link>
        </h2>
        <p className="line-clamp-2 text-[13px] leading-5 text-dim">{description}</p>
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-faint">
            Open in studio <ArrowUpRight className="size-3.5" aria-hidden />
          </span>
          <Link
            href={designerHref(id)}
            className="relative z-10 inline-flex items-center gap-2 rounded-full border border-hairline-strong px-4 py-2 text-[12px] text-foreground transition-colors hover:border-foreground hover:bg-foreground hover:text-background"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Customize
          </Link>
        </div>
      </div>
    </article>
  );
}
