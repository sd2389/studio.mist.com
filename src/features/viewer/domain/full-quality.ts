import { useViewerQualityStore } from "@/stores/viewer-quality-store";

/**
 * Draws the stage at full quality, whatever the device. The studio's "auto" quality reads the
 * device: 2 cores or fewer, or under 4 GB, is Performance, whose gem shaders trace fewer bounces
 * on the very materials an export renders, and a 4-core machine is Balanced. The render harness
 * calls this before its stage mounts, so a job renders the same on a small runner as on a GPU
 * host; the materials are made at full quality from the start.
 */
export function pinFullQuality(): void {
  useViewerQualityStore.getState().setLevel("high");
}
