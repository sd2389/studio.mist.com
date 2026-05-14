/** Human-readable scene title from route id. */
export function sceneDisplayName(modelId: string): string {
  if (modelId === "clearcoat") return "Clearcoat Ring";
  try {
    const decoded = decodeURIComponent(modelId);
    return decoded
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } catch {
    return modelId;
  }
}
