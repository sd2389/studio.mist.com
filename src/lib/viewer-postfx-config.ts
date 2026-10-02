import type { SceneAdvancedSettings } from "@/lib/slot-materials/model-config";

export type PostFXQuality = "performance" | "low" | "medium" | "high" | "ultra";

export type ViewerPostFXConfig = {
  enabled?: boolean;
  /**
   * Temporal reprojection AA: accumulates jittered frames, so small facets resolve sharply
   * and sparkles stay stable instead of shimmering. Viewport only — a single export frame has
   * no history, so exports keep SMAA.
   */
  temporalAA?: boolean;
  aoEnabled: boolean;
  ao: {
    aoRadius: number;
    intensity: number;
    distanceFalloff: number;
    denoiseRadius: number;
    halfRes: boolean;
    depthAwareUpsampling: boolean;
    quality: PostFXQuality;
  };
  bloom: {
    intensity: number;
    luminanceThreshold: number;
    luminanceSmoothing: number;
    radius: number;
    mipmapBlur: boolean;
  };
  dof: {
    enabled: boolean;
    /** World-space depth either side of the focus that stays sharp (the piece is ~1.4 across). */
    focalRange: number;
    bokehScale: number;
  };
  stars: {
    enabled: boolean;
    /** Linear HDR level a highlight must exceed to throw rays; above any lit surface. */
    threshold: number;
    intensity: number;
    /** Ray step in pixels; ray length scales with it. */
    reach: number;
  };
};

export const DEFAULT_VIEWER_POSTFX: ViewerPostFXConfig = {
  aoEnabled: true,
  ao: {
    aoRadius: 1.9,
    intensity: 0.34,
    distanceFalloff: 0.6,
    denoiseRadius: 6,
    halfRes: true,
    depthAwareUpsampling: true,
    quality: "medium",
  },
  // Threshold sits above everything a lit surface reflects, so only true HDR highlights —
  // gem glints and metal hot spots — bloom. A lower one hazed whole stones and read as fog.
  bloom: {
    intensity: 0.22,
    luminanceThreshold: 2.2,
    luminanceSmoothing: 0.4,
    radius: 0.28,
    mipmapBlur: true,
  },
  dof: {
    enabled: false,
    focalRange: 0.9,
    bokehScale: 1.6,
  },
  stars: {
    enabled: false,
    threshold: 2.4,
    intensity: 0.9,
    reach: 2.2,
  },
};

export function resolvePostFXConfig(advanced?: SceneAdvancedSettings): ViewerPostFXConfig {
  return {
    aoEnabled: advanced?.ao !== false,
    ao: DEFAULT_VIEWER_POSTFX.ao,
    bloom: {
      ...DEFAULT_VIEWER_POSTFX.bloom,
      intensity: advanced?.bloom ?? DEFAULT_VIEWER_POSTFX.bloom.intensity,
    },
    dof: { ...DEFAULT_VIEWER_POSTFX.dof, enabled: advanced?.macroLens === true },
    stars: { ...DEFAULT_VIEWER_POSTFX.stars, enabled: advanced?.starGlints === true },
  };
}
