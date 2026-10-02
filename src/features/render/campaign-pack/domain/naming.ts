import { packMetalLabel } from "./defaults";
import type { PackIdentity, PackMetalId } from "./types";

const MAX_SEGMENT = 64;

/** Filesystem- and URL-safe path segment. Keeps case (SKUs are often upper-case). */
export function sanitizeSegment(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, MAX_SEGMENT);
}

export function slugify(value: string | null | undefined): string {
  return sanitizeSegment(value).toLowerCase();
}

/** `{sku|name|modelId}` — the folder every pack file lives under. */
export function packRootName(identity: PackIdentity): string {
  return (
    sanitizeSegment(identity.sku) ||
    sanitizeSegment(identity.name) ||
    sanitizeSegment(identity.modelId) ||
    "campaign-pack"
  );
}

export function packZipName(rootName: string): string {
  return `${rootName}_campaign-pack.zip`;
}

export function metalSlug(id: PackMetalId): string {
  return id === "current" ? "as-configured" : slugify(packMetalLabel(id)) || slugify(id);
}

/** Appends -2, -3… so two saved poses called "Hero" never overwrite each other. */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const root = base || "view";
  let slug = root;
  for (let n = 2; taken.has(slug); n += 1) slug = `${root}-${n}`;
  taken.add(slug);
  return slug;
}

export function frameNumber(index: number, total: number): string {
  return String(index + 1).padStart(Math.max(3, String(total).length), "0");
}

export const packPaths = {
  still: (root: string, metal: string, angle: string, ext: "jpg" | "png") =>
    `${root}/stills/${metal}_${angle}.${ext}`,
  turntable: (root: string, metal: string, width: number, height: number) =>
    `${root}/video/${metal}_turntable_${width}x${height}.mp4`,
  spinFrame: (root: string, metal: string, index: number, total: number) =>
    `${root}/spin/${metal}/${metal}_${frameNumber(index, total)}.jpg`,
  scope: (root: string) => `${root}/cut-scope/aset_top.png`,
  spinViewer: (root: string) => `${root}/spin/spin.html`,
  embedPage: (root: string) => `${root}/embed/embed.html`,
  embedSnippet: (root: string) => `${root}/embed/embed-snippet.html`,
  readme: (root: string) => `${root}/README.md`,
  manifest: (root: string) => `${root}/manifest.json`,
};

/** Path of `path` relative to the folder holding `fromFile` (both under the same root). */
export function relativeTo(fromFile: string, path: string): string {
  const fromDir = fromFile.split("/").slice(0, -1);
  const target = path.split("/");
  let shared = 0;
  while (shared < fromDir.length && fromDir[shared] === target[shared]) shared += 1;
  const up = fromDir.slice(shared).map(() => "..");
  return [...up, ...target.slice(shared)].join("/");
}
