import type { LightingPresetId } from "@/stores/material-preset-store";

/** drei HDR environment preset mapped from our lighting modes. Used as fallback when HDR file missing. */
export const ENV_BY_LIGHTING: Record<LightingPresetId, "studio" | "apartment" | "night"> = {
  studio: "studio",
  soft: "apartment",
  dark: "night",
};

/**
 * Real CC0 HDR environment maps from Poly Haven. Higher quality than the bundled
 * drei presets — give crisp HDR reflections and real spectral fire on facets.
 */
export const HDR_FILE_BY_LIGHTING: Record<LightingPresetId, string> = {
  studio: "/hdr/photo_studio_01_1k.hdr",
  soft: "/hdr/studio_small_09_1k.hdr",
  dark: "/hdr/dancing_hall_1k.hdr",
};

/**
 * Catalog-style backgrounds. Pure white blew out the diamonds visually — neutral mid-greys
 * give the product something to contrast against without going dark.
 */
export const BG_BY_LIGHTING: Record<LightingPresetId, string> = {
  studio: "#E5E3DC",
  soft: "#DDD9D1",
  dark: "#3A3A3D",
};

/** Multiplied by the env HDRI contribution; lower = more contrasty product reads. */
export const AMBIENT_BY_LIGHTING: Record<LightingPresetId, number> = {
  studio: 0.4,
  soft: 0.34,
  dark: 0.22,
};

/** Cast-shadow key light. */
export const SPOT_BY_LIGHTING: Record<LightingPresetId, number> = {
  studio: 0.95,
  soft: 0.78,
  dark: 0.6,
};

/** Tone-mapping exposure for the renderer. <1 brings highlights down. */
export const TONE_EXPOSURE_BY_LIGHTING: Record<LightingPresetId, number> = {
  studio: 0.9,
  soft: 0.85,
  dark: 0.95,
};

/** Contact-shadow opacity per lighting mode (used by drei `<ContactShadows>`). */
export const CONTACT_SHADOW_OPACITY: Record<LightingPresetId, number> = {
  studio: 0.28,
  soft: 0.22,
  dark: 0.4,
};
