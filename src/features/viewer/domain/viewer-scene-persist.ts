export type ViewerShellVariant = "studio" | "embed";

/** Shopper embed is session-only. Studio keeps the existing persist path. */
export function shouldPersistViewerScene(variant: ViewerShellVariant): boolean {
  return variant === "studio";
}
