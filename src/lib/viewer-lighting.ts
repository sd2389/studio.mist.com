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
  studio: "/hdr/photo_studio_01_2k.hdr",
  soft: "/hdr/studio_small_09_2k.hdr",
  dark: "/hdr/dancing_hall_2k.hdr",
  catalog: "/hdr/brown_photostudio_02_2k.hdr",
  dramatic: "/hdr/studio_small_08_2k.hdr",
};

/**
 * Backdrop used while a gem is the subject.
 *
 * A fully transmissive stone refracts whatever sits behind it, so the backdrop *is* the
 * stone's body colour. The warm mid-grey in `BG_BY_LIGHTING` is why gems read beige and
 * murky; a near-white backdrop is what makes a colourless stone read icy. The dark facet
 * windows that give it contrast come from the geometry, not from darkening the scene.
 */
export const GEM_BG_BY_LIGHTING: Record<LightingPresetId, string> = {
  studio: "#F7F8FA",
  soft: "#F4F2EE",
  dark: "#2A2A30",
  catalog: "#FBFAF7",
  dramatic: "#1E1E23",
};

/**
 * Gems need a high-contrast environment to read as gems. Brilliance is the alternation of
 * bright and dark facets, and that contrast comes from what each facet reflects — so a flat
 * studio HDR mirrors near-uniform grey into every facet and the stone goes milky. A source-rich
 * environment (bright emitters against dark surroundings) is what produces facet flash and fire.
 * Metals keep the softer studio maps; see `HDR_FILE_BY_LIGHTING`.
 */
export const GEM_HDR_FILE_BY_LIGHTING: Record<LightingPresetId, string> = {
  studio: "/hdr/gem-lightbox_1k.hdr",
  soft: "/hdr/gem-lightbox_1k.hdr",
  dark: "/hdr/gem-lightbox_1k.hdr",
  catalog: "/hdr/gem-lightbox_1k.hdr",
  dramatic: "/hdr/gem-lightbox_1k.hdr",
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

/**
 * Ambient and key-light levels while a gem is the subject.
 *
 * `ambientLight` illuminates every facet uniformly, regardless of which direction it
 * faces — exactly the opposite of what a cut stone needs, since its read depends on some
 * facets reflecting a bright point and others reflecting nothing. The metal-tuned ambient
 * (0.32) floods every facet bright enough that the gem-lightbox HDR's dark regions never
 * reach black. Gems get their own, much lower floor so the HDR does the actual work.
 */
export const GEM_AMBIENT_BY_LIGHTING: Record<LightingPresetId, number> = {
  studio: 0.04,
  soft: 0.04,
  dark: 0.02,
  catalog: 0.05,
  dramatic: 0.02,
};

export const GEM_SPOT_BY_LIGHTING: Record<LightingPresetId, number> = {
  studio: 0.3,
  soft: 0.25,
  dark: 0.2,
  catalog: 0.35,
  dramatic: 0.2,
};

/** Tone-mapping exposure for the renderer. <1 brings highlights down. */
export const TONE_EXPOSURE_BY_LIGHTING: Record<LightingPresetId, number> = {
  studio: 0.86,
  soft: 0.82,
  dark: 0.9,
  catalog: 0.86,
  dramatic: 0.86,
};

// Tried a lower gem-specific exposure to deepen facet blacks — verified via diagnostic +
// screenshot that it darkens the whole scene (including the deliberately near-white
// backdrop) roughly uniformly, without meaningfully increasing internal facet contrast.
// Single-bounce raster transmission has a physical ceiling here: true black facet windows
// come from total internal reflection redirecting light away from camera entirely, which
// needs multi-bounce tracing (see GemFireOverlay) — no scene-light tweak reproduces that
// in one refraction. Not worth the regression; removed rather than left half-applied.

/** Contact-shadow opacity per lighting mode (used by `<ViewerContactShadows>`). */
export const CONTACT_SHADOW_OPACITY: Record<LightingPresetId, number> = {
  studio: 0.24,
  soft: 0.2,
  dark: 0.34,
  catalog: 0.24,
  dramatic: 0.24,
};
