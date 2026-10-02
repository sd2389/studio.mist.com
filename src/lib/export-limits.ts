/**
 * What a plan lets an export be (backend/app/features/billing/plans.py): the longest side of
 * a still or video frame, in pixels, and whether every frame carries the watermark.
 */
export type ExportLimits = {
  maxEdge: number;
  watermark: boolean;
};

/** Server render jobs (RenderHarness): the API clamps their size to the plan itself. */
export const NO_EXPORT_LIMITS: ExportLimits = { maxEdge: Number.POSITIVE_INFINITY, watermark: false };

export function fitsExportLimits(limits: ExportLimits, width: number, height: number): boolean {
  return Math.max(width, height) <= limits.maxEdge;
}

/** The export pipeline's own check: whatever a UI offered, nothing above the cap renders. */
export function assertExportSize(limits: ExportLimits, width: number, height: number): void {
  if (fitsExportLimits(limits, width, height)) return;
  throw new Error(`${width}×${height} is larger than your plan exports (${limits.maxEdge}px on the longest side).`);
}

/** The largest pixel ratio, up to `preferred`, that keeps a `width × height` frame within the cap. */
export function pixelRatioWithinLimits(limits: ExportLimits, width: number, height: number, preferred: number): number {
  return Math.min(preferred, limits.maxEdge / Math.max(width, height, 1));
}
