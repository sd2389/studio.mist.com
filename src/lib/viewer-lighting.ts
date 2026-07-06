import type { LightingPresetId } from "@/stores/material-preset-store";

/** drei HDR environment preset mapped from our lighting modes. Used as fallback when HDR file missing. */
export const ENV_BY_LIGHTING: Record<LightingPresetId, "studio" | "apartment" | "night"> = {
  studio: "studio",
  soft: "apartment",
  dark: "night",
  catalog: "studio",
  dramatic: "night",
};

/**
 * Real CC0 HDR environment maps from Poly Haven. Higher quality than the bundled
 * drei presets — give crisp HDR reflections and real spectral fire on facets.
 */
export const HDR_FILE_BY_LIGHTING: Record<LightingPresetId, string> = {
  studio: "/hdr/photo_studio_01_1k.hdr",
  soft: "/hdr/studio_small_09_1k.hdr",
  dark: "/hdr/dancing_hall_1k.hdr",
  catalog: "/hdr/brown_photostudio_02_1k.hdr",
  dramatic: "/hdr/studio_small_08_1k.hdr",
};

/**
 * Catalog-style backgrounds. Pure white blew out the diamonds visually — neutral mid-greys
 * give the product something to contrast against without going dark.
 */
export const BG_BY_LIGHTING: Record<LightingPresetId, string> = {
  studio: "#ECE7DD",
  soft: "#E4DDD2",
  dark: "#35353A",
  catalog: "#F4F1EA",
  dramatic: "#1E1E23",
};

/** Multiplied by the env HDRI contribution; lower = more contrasty product reads. */
export const AMBIENT_BY_LIGHTING: Record<LightingPresetId, number> = {
  studio: 0.32,
  soft: 0.28,
  dark: 0.2,
  catalog: 0.38,
  dramatic: 0.16,
};

/** Cast-shadow key light. */
export const SPOT_BY_LIGHTING: Record<LightingPresetId, number> = {
  studio: 1.1,
  soft: 0.9,
  dark: 0.7,
  catalog: 1.25,
  dramatic: 1.4,
};

/** Tone-mapping exposure for the renderer. <1 brings highlights down. */
export const TONE_EXPOSURE_BY_LIGHTING: Record<LightingPresetId, number> = {
  studio: 0.86,
  soft: 0.82,
  dark: 0.9,
  catalog: 0.86,
  dramatic: 0.86,
};

/** Contact-shadow opacity per lighting mode (used by drei `<ContactShadows>`). */
export const CONTACT_SHADOW_OPACITY: Record<LightingPresetId, number> = {
  studio: 0.24,
  soft: 0.2,
  dark: 0.34,
  catalog: 0.24,
  dramatic: 0.24,
};
