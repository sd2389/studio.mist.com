/**
 * H.264 codec-string selection for WebCodecs.
 *
 * A fixed `avc1.640028` (High@4.0) caps the encoder at 1080p30, so 4K/8K configs are
 * rejected by `VideoEncoder.isConfigSupported`. The level has to be derived from frame
 * size (macroblocks), throughput (macroblocks/s) and bitrate — ITU-T H.264 Table A-1.
 */

export type AvcLevel = {
  name: string;
  /** `level_idc` (level × 10), written as the last byte of the codec string. */
  idc: number;
  maxMacroblocksPerSecond: number;
  maxFrameMacroblocks: number;
  /** Max video bitrate for Baseline/Main, in kbit/s. High profile allows 1.25×. */
  maxBitrateKbps: number;
};

export const AVC_LEVELS: readonly AvcLevel[] = [
  { name: "3.0", idc: 30, maxMacroblocksPerSecond: 40_500, maxFrameMacroblocks: 1_620, maxBitrateKbps: 10_000 },
  { name: "3.1", idc: 31, maxMacroblocksPerSecond: 108_000, maxFrameMacroblocks: 3_600, maxBitrateKbps: 14_000 },
  { name: "3.2", idc: 32, maxMacroblocksPerSecond: 216_000, maxFrameMacroblocks: 5_120, maxBitrateKbps: 20_000 },
  { name: "4.0", idc: 40, maxMacroblocksPerSecond: 245_760, maxFrameMacroblocks: 8_192, maxBitrateKbps: 20_000 },
  { name: "4.1", idc: 41, maxMacroblocksPerSecond: 245_760, maxFrameMacroblocks: 8_192, maxBitrateKbps: 50_000 },
  { name: "4.2", idc: 42, maxMacroblocksPerSecond: 522_240, maxFrameMacroblocks: 8_704, maxBitrateKbps: 50_000 },
  { name: "5.0", idc: 50, maxMacroblocksPerSecond: 589_824, maxFrameMacroblocks: 22_080, maxBitrateKbps: 135_000 },
  { name: "5.1", idc: 51, maxMacroblocksPerSecond: 983_040, maxFrameMacroblocks: 36_864, maxBitrateKbps: 240_000 },
  { name: "5.2", idc: 52, maxMacroblocksPerSecond: 2_073_600, maxFrameMacroblocks: 36_864, maxBitrateKbps: 240_000 },
  { name: "6.0", idc: 60, maxMacroblocksPerSecond: 4_177_920, maxFrameMacroblocks: 139_264, maxBitrateKbps: 240_000 },
  { name: "6.1", idc: 61, maxMacroblocksPerSecond: 8_355_840, maxFrameMacroblocks: 139_264, maxBitrateKbps: 480_000 },
  { name: "6.2", idc: 62, maxMacroblocksPerSecond: 16_711_680, maxFrameMacroblocks: 139_264, maxBitrateKbps: 800_000 },
];

const HIGH_PROFILE_IDC = 0x64;
const HIGH_PROFILE_BITRATE_FACTOR = 1.25;

export type VideoStreamSpec = {
  width: number;
  height: number;
  fps: number;
  /** Bits per second. Omit to check size/throughput only. */
  bitrate?: number;
};

function fitsLevel(level: AvcLevel, spec: VideoStreamSpec): boolean {
  const widthMbs = Math.ceil(spec.width / 16);
  const heightMbs = Math.ceil(spec.height / 16);
  const frameMbs = widthMbs * heightMbs;
  // Annex A: neither dimension may exceed sqrt(8 * MaxFS) macroblocks.
  const maxSideMbs = Math.sqrt(8 * level.maxFrameMacroblocks);
  if (frameMbs > level.maxFrameMacroblocks) return false;
  if (widthMbs > maxSideMbs || heightMbs > maxSideMbs) return false;
  if (frameMbs * spec.fps > level.maxMacroblocksPerSecond) return false;
  if (spec.bitrate !== undefined) {
    const maxBitrate = level.maxBitrateKbps * 1000 * HIGH_PROFILE_BITRATE_FACTOR;
    if (spec.bitrate > maxBitrate) return false;
  }
  return true;
}

/** Lowest High-profile level that can carry the stream, or null when even 6.2 cannot. */
export function selectAvcLevel(spec: VideoStreamSpec): AvcLevel | null {
  return AVC_LEVELS.find((level) => fitsLevel(level, spec)) ?? null;
}

export function avcCodecString(level: AvcLevel): string {
  const hex = (value: number) => value.toString(16).padStart(2, "0");
  return `avc1.${hex(HIGH_PROFILE_IDC)}00${hex(level.idc)}`;
}

/** The minimal level first, then higher levels — some encoders only accept a larger level. */
export function avcCodecCandidates(spec: VideoStreamSpec): string[] {
  const first = selectAvcLevel(spec);
  if (!first) return [];
  return AVC_LEVELS.filter((level) => level.idc >= first.idc).map(avcCodecString);
}

/** ~0.12 bits per pixel per frame: clean for mostly-static turntables, sane file sizes. */
export function defaultVideoBitrate(width: number, height: number, fps: number): number {
  return Math.round(width * height * fps * 0.12);
}

export type EncoderConfigProbe = (config: VideoEncoderConfig) => Promise<{ supported?: boolean }>;

export type ResolvedEncoderConfig =
  | { ok: true; codec: string; config: VideoEncoderConfig }
  | { ok: false; reason: string };

const HARDWARE_PREFERENCES: HardwareAcceleration[] = ["no-preference", "prefer-software"];

/**
 * Walks codec candidates × hardware preferences until the browser accepts one. Returns a
 * human-readable reason instead of throwing so callers can show why MP4 is unavailable.
 */
export async function resolveH264EncoderConfig(
  spec: Required<VideoStreamSpec>,
  probe: EncoderConfigProbe,
): Promise<ResolvedEncoderConfig> {
  const size = `${spec.width}×${spec.height}`;
  if (spec.width % 2 !== 0 || spec.height % 2 !== 0) {
    return { ok: false, reason: `H.264 needs even dimensions; ${size} is odd.` };
  }
  const candidates = avcCodecCandidates(spec);
  if (candidates.length === 0) {
    return { ok: false, reason: `${size} at ${spec.fps} fps exceeds the largest H.264 level (6.2).` };
  }
  for (const codec of candidates) {
    for (const hardwareAcceleration of HARDWARE_PREFERENCES) {
      const config: VideoEncoderConfig = {
        codec,
        width: spec.width,
        height: spec.height,
        bitrate: spec.bitrate,
        framerate: spec.fps,
        bitrateMode: "variable",
        latencyMode: "quality",
        hardwareAcceleration,
        avc: { format: "avc" },
      };
      const result = await probe(config).catch(() => null);
      if (result?.supported) return { ok: true, codec, config };
    }
  }
  return {
    ok: false,
    reason: `This browser's H.264 encoder can't produce ${size} at ${spec.fps} fps (tried ${candidates[0]}).`,
  };
}
