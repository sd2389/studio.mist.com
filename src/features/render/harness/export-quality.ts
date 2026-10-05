import { useViewerQualityStore } from "@/stores/viewer-quality-store";

/**
 * Exports render at full quality whatever host the worker runs on. The studio's "auto" quality
 * reads the host: 2 cores or fewer, or under 4 GB, is Performance, whose gem shaders trace fewer
 * bounces on the very materials the export renders, and a 4-core runner is Balanced. Pinned to
 * High before the stage mounts, so the materials are made at full quality from the start.
 */
export function pinExportQuality(): void {
  useViewerQualityStore.getState().setLevel("high");
}
