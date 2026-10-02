export type ViewerShellVariant = "studio" | "embed";

/** The embed is view only and never saves; the studio saves every change to the scene. */
export function shouldPersistViewerScene(variant: ViewerShellVariant): boolean {
  return variant === "studio";
}
