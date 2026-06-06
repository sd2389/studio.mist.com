export type ImageResolutionId = "hd" | "2k" | "4k" | "8k";
export type ImageFormat = "png" | "jpeg";
export type AspectId = "16:9" | "1:1" | "4:3";

export const IMAGE_RESOLUTIONS: Record<
  ImageResolutionId,
  { label: string; width: number; height: number }
> = {
  hd: { label: "HD", width: 1280, height: 720 },
  "2k": { label: "2K", width: 2560, height: 1440 },
  "4k": { label: "4K", width: 3840, height: 2160 },
  "8k": { label: "8K", width: 7680, height: 4320 },
};

export const ASPECT_RATIO: Record<AspectId, number> = {
  "16:9": 16 / 9,
  "1:1": 1,
  "4:3": 4 / 3,
};

export function computeImageSize(
  resolution: ImageResolutionId,
  aspect: AspectId,
): { width: number; height: number } {
  const base = IMAGE_RESOLUTIONS[resolution];
  const height = base.height;
  const width = Math.round(height * ASPECT_RATIO[aspect]);
  return { width, height };
}

export const VIDEO_RESOLUTIONS = [
  { id: "720p", label: "720p", width: 1280, height: 720 },
  { id: "1080p", label: "1080p", width: 1920, height: 1080 },
  { id: "4k", label: "4K", width: 3840, height: 2160 },
  { id: "8k", label: "8K", width: 7680, height: 4320 },
] as const;

export type VideoResolutionId = (typeof VIDEO_RESOLUTIONS)[number]["id"];

export const VIDEO_FPS_OPTIONS = [24, 30, 48, 60, 90, 120] as const;
export type VideoFps = (typeof VIDEO_FPS_OPTIONS)[number];

export function mimeForImageFormat(format: ImageFormat): string {
  return format === "jpeg" ? "image/jpeg" : "image/png";
}

export function extForImageFormat(format: ImageFormat): string {
  return format === "jpeg" ? "jpg" : "png";
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `~${Math.round(bytes / 1024)} KB`;
  return `~${bytes} B`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
