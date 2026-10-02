"use client";

import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { JewelryCanvas } from "@/components/gallery/JewelryCanvas";
import { prettyName, StudioLayout } from "@/features/viewer";
import { designerHref, getJewelryById, type JewelryId } from "@/lib/jewelry/assembly";
import { useThemeLighting } from "@/components/site/use-theme-lighting";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

export function JewelryViewer({ pieceId }: { pieceId: JewelryId }) {
  const piece = getJewelryById(pieceId);
  if (!piece) throw new Error(`Unknown jewelry id: ${pieceId}`);

  const preset = useMaterialPresetStore((s) => s.preset);
  const autoRotate = useMaterialPresetStore((s) => s.autoRotate);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  useThemeLighting();

  return (
    <StudioLayout
      modelId={`jewelry-${pieceId}`}
      title={piece.label}
      subtitle={`Generated CAD · ${preset === "original" ? "as designed" : prettyName(preset)} · ${lighting}`}
      back={{ href: "/gallery", label: "Gallery" }}
      actions={
        <Link
          href={designerHref(piece.id)}
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.24em] text-background transition hover:bg-holo sm:px-4"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Customize in Designer</span>
          <span className="sm:hidden">Customize</span>
        </Link>
      }
    >
      <JewelryCanvas piece={piece} preset={preset} autoRotate={autoRotate} lighting={lighting} />
    </StudioLayout>
  );
}
