import type { SceneAdvancedSettings } from "@/lib/slot-materials/model-config";

export type PostFXQuality = "performance" | "low" | "medium" | "high" | "ultra";

export type ViewerPostFXConfig = {
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
  bloom: {
    intensity: 0.28,
    luminanceThreshold: 0.9,
    luminanceSmoothing: 0.12,
    radius: 0.75,
    mipmapBlur: true,
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
  };
}
