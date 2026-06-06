export function stemFromFilename(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "");
  return base.replace(/\.[^.]+$/, "").trim() || "Untitled";
}

export function skuFromFilename(filename: string): string {
  const stem = stemFromFilename(filename);
  const sanitized = stem
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return sanitized || "MODEL-001";
}
