import type { PostFXQuality, ViewerPostFXConfig } from "@/lib/viewer-postfx-config";

export type QualityLevel = "auto" | "high" | "balanced" | "performance";
export type QualityTier = Exclude<QualityLevel, "auto">;

export type DeviceCaps = {
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
  isMobile: boolean;
};

export type EffectiveQuality = {
  tier: QualityTier;
  dprCap: number;
  postfxEnabled: boolean;
  aoQuality: PostFXQuality;
  aoHalfRes: boolean;
};

const TIER_SETTINGS: Record<QualityTier, Omit<EffectiveQuality, "tier">> = {
  high: { dprCap: 2, postfxEnabled: true, aoQuality: "high", aoHalfRes: false },
  balanced: { dprCap: 1.5, postfxEnabled: true, aoQuality: "medium", aoHalfRes: true },
  performance: { dprCap: 1, postfxEnabled: false, aoQuality: "performance", aoHalfRes: true },
};

/** Conservative heuristics — unknown values fall to the safe middle. */
export function detectDeviceTier(caps: DeviceCaps): QualityTier {
  const mem = caps.deviceMemoryGb;
  const cores = caps.hardwareConcurrency;
  if (mem !== undefined && mem < 4) return "performance";
  if (cores !== undefined && cores <= 2) return "performance";
  if (caps.isMobile) return "balanced";
  if (mem !== undefined && mem >= 8 && cores !== undefined && cores >= 8) return "high";
  return "balanced";
}

export function resolveEffectiveQuality(level: QualityLevel, caps: DeviceCaps): EffectiveQuality {
  const tier = level === "auto" ? detectDeviceTier(caps) : level;
  return { tier, ...TIER_SETTINGS[tier] };
}

/**
 * Viewport-only degradation. High tier is the identity — this is the
 * export-parity guarantee: export paths never call this function, and even
 * if they did at high tier, output would be unchanged.
 */
export function applyQualityToPostFX(
  config: ViewerPostFXConfig,
  q: EffectiveQuality,
): ViewerPostFXConfig {
  if (q.tier === "high") return config;
  if (!q.postfxEnabled) return { ...config, aoEnabled: false };
  return {
    ...config,
    ao: { ...config.ao, quality: q.aoQuality, halfRes: q.aoHalfRes },
  };
}

const VALID_LEVELS: readonly QualityLevel[] = ["auto", "high", "balanced", "performance"];

/** Sanitise a value from untrusted storage (e.g. localStorage). Falls back to "auto". */
export function normalizeQualityLevel(value: unknown): QualityLevel {
  if (typeof value === "string" && (VALID_LEVELS as string[]).includes(value)) {
    return value as QualityLevel;
  }
  return "auto";
}

/** Browser caps snapshot; SSR-safe. */
export function readDeviceCaps(): DeviceCaps {
  if (typeof navigator === "undefined") return { isMobile: false };
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemoryGb: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    isMobile: /Android|iPhone|iPad|Mobile/i.test(nav.userAgent),
  };
}

/** Jewelry gem shader: Performance tier reduces sparkle taps / internal lobe. */
export function gemShaderQualityReduce(tier: QualityTier): boolean {
  return tier === "performance";
}
