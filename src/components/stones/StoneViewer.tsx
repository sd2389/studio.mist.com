"use client";

import { StoneCanvas } from "@/components/stones/StoneCanvas";
import { prettyName, StudioLayout } from "@/features/viewer";
import { getCutById, type CutId } from "@/lib/stones/cut-geometries";
import { useThemeLighting } from "@/components/site/use-theme-lighting";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

export function StoneViewer({ cutId }: { cutId: CutId }) {
  const cut = getCutById(cutId);
  if (!cut) throw new Error(`Unknown cut id: ${cutId}`);

  // A loose stone has no "original" material of its own: it is a diamond until another gem is picked.
  const selectedPreset = useMaterialPresetStore((s) => s.preset);
  const preset = selectedPreset === "original" ? "diamond" : selectedPreset;
  const autoRotate = useMaterialPresetStore((s) => s.autoRotate);
  const lighting = useMaterialPresetStore((s) => s.lighting);
  useThemeLighting();

  return (
    <StudioLayout
      modelId={`stone-${cut.id}`}
      title={cut.label}
      subtitle={`${prettyName(preset)} · ${lighting}`}
      back={{ href: "/stones", label: "All cuts" }}
    >
      <StoneCanvas cut={cut} preset={preset} autoRotate={autoRotate} lighting={lighting} />
    </StudioLayout>
  );
}
