import type { GemStudioPreset } from "@/lib/gem-gpu/gem-studio-environment";
import type { LightingPresetId } from "@/stores/material-preset-store";

export type LightingPreset = {
  /** Metal environment: real CC0 HDRs from Poly Haven — crisp reflections on polished metal. */
  hdr: string;
  /**
   * Procedural jewelry tent for traced gems. Brilliance is the alternation of bright and dark
   * facets, so gems need strip softboxes, dark gaps and pinpoint sources; a flat studio HDR
   * mirrors near-uniform grey into every facet and the stone goes milky.
   */
  gemTent: GemStudioPreset;
  /** Catalogue backdrop: neutral mid-greys give metal something to contrast against. */
  background: string;
  /**
   * Backdrop while a loose gem is the subject. A transmissive stone refracts whatever sits
   * behind it, so a near-white backdrop is what makes a colourless stone read icy.
   */
  gemBackground: string;
  /** Ambient light; lower reads more contrasty. */
  ambient: number;
  /** Cast-shadow key light at `KEY_LIGHT_POSITION`. */
  spot: number;
  /** Tone-mapping exposure; below 1 brings highlights down. */
  exposure: number;
  /** `<ViewerContactShadows>` opacity. */
  contactShadow: number;
};

/**
 * Everything a lighting mode sets, in one place. Gem contrast (true black facet windows)
 * comes from the ray-traced gem shader (`gem-gpu/gem-trace-shader.ts`); lights and exposure
 * are tuned for metals and leave traced gems alone.
 */
export const LIGHTING_PRESETS: Record<LightingPresetId, LightingPreset> = {
  studio: {
    hdr: "/hdr/photo_studio_01_2k.hdr",
    gemTent: "white",
    background: "#ECE7DD",
    gemBackground: "#F7F8FA",
    ambient: 0.32,
    spot: 1.1,
    exposure: 0.86,
    contactShadow: 0.24,
  },
  soft: {
    hdr: "/hdr/studio_small_09_2k.hdr",
    gemTent: "studio",
    background: "#E4DDD2",
    gemBackground: "#F4F2EE",
    ambient: 0.28,
    spot: 0.9,
    exposure: 0.82,
    contactShadow: 0.2,
  },
  dark: {
    hdr: "/hdr/dancing_hall_2k.hdr",
    gemTent: "contrast",
    background: "#35353A",
    gemBackground: "#2A2A30",
    ambient: 0.2,
    spot: 0.7,
    exposure: 0.9,
    contactShadow: 0.34,
  },
  catalog: {
    hdr: "/hdr/brown_photostudio_02_2k.hdr",
    gemTent: "white",
    background: "#F4F1EA",
    gemBackground: "#FBFAF7",
    ambient: 0.38,
    spot: 1.25,
    exposure: 0.86,
    contactShadow: 0.24,
  },
  dramatic: {
    hdr: "/hdr/studio_small_08_2k.hdr",
    gemTent: "sparkle",
    background: "#1E1E23",
    gemBackground: "#1E1E23",
    ambient: 0.16,
    spot: 1.4,
    exposure: 0.86,
    contactShadow: 0.24,
  },
};

/**
 * Key light position. High overhead (~67° up) like a catalogue softbox: the contact shadow
 * stays short and sits under the piece instead of trailing a full ring-height across the set.
 */
export const KEY_LIGHT_POSITION: [number, number, number] = [2.2, 7.5, 2.8];

/** The studio look that sits on the site's theme: a dark set on the dark stage, the white studio on paper. */
export function siteLighting(theme: "dark" | "light" | null): LightingPresetId {
  return theme === "dark" ? "dramatic" : "studio";
}
