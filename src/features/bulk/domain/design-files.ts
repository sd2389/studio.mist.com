import { isModelCompanionFilename, isSupportedModelFilename } from "@/lib/model-key";
import { baseName, folderOf, type DroppedFile } from "@/lib/upload/dropped-files";

/**
 * Companions the API takes, and the format each goes with: an OBJ's materials, a glTF's buffers
 * (COMPANION_FOR in backend/app/features/ingest/designs.py).
 */
export const COMPANION_FOR: Readonly<Record<string, string>> = { mtl: "obj", bin: "gltf" };
/** The most companions one design may bring (`IngestItemIn.companions`). */
export const MAX_COMPANIONS = 8;
/** Formats whose textures sit beside them, referenced by name. */
const TEXTURED_FORMATS = ["obj", "gltf"];

/** One design's files, as `groupModelFiles` takes a single upload's: the model and what it references. */
export type DesignFiles = {
  /** The CAD file. */
  source: DroppedFile;
  /** Uploaded with it: an OBJ's MTL, a glTF's `.bin`. */
  companions: DroppedFile[];
  /** Kept back: conversion replaces every material, so textures aren't uploaded. */
  textures: DroppedFile[];
};

export type LeftOutFile = { file: DroppedFile; reason: string };

export type GroupedFiles = {
  /** In path order. */
  designs: DesignFiles[];
  /** CSV files: the manifest, when there is one. */
  manifests: DroppedFile[];
  /** Files no design takes, and why. */
  leftOut: LeftOutFile[];
};

export function extensionOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

function stemOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return (dot <= 0 ? name : name.slice(0, dot)).toLowerCase();
}

/** Its model among those near it: the one of its own name (`R-1.mtl` → `R-1.obj`), else the only one. */
function ownerAmong(candidates: DesignFiles[], path: string): DesignFiles | null {
  const stem = stemOf(path);
  return candidates.find((design) => stemOf(design.source.path) === stem) ?? (candidates.length === 1 ? candidates[0] : null);
}

/** The models an MTL or `.bin` may go with: its format's, in its own folder. */
function companionCandidates(designs: DesignFiles[], path: string, format: string): DesignFiles[] {
  const folder = folderOf(path);
  return designs.filter(
    (design) => extensionOf(design.source.path) === format && folderOf(design.source.path) === folder,
  );
}

/** The models a texture may go with: an OBJ or glTF in its folder, or the folder above (`textures/`). */
function textureCandidates(designs: DesignFiles[], path: string): DesignFiles[] {
  const folder = folderOf(path);
  return designs.filter((design) => {
    const modelFolder = folderOf(design.source.path);
    return (
      TEXTURED_FORMATS.includes(extensionOf(design.source.path)) &&
      (modelFolder === folder || modelFolder === folderOf(folder))
    );
  });
}

/**
 * A bulk drop as designs: each CAD file with the companions dropped beside it, as
 * `groupModelFiles` groups a single upload's (an OBJ with its MTL and textures, a glTF with its
 * `.bin`), and the CSV manifest. Textures go with their model but stay behind, and files no
 * design takes are left out with the reason.
 */
export function groupDesignFiles(files: DroppedFile[]): GroupedFiles {
  const designs: DesignFiles[] = [];
  const manifests: DroppedFile[] = [];
  const leftOut: LeftOutFile[] = [];
  const extras: DroppedFile[] = [];
  for (const dropped of files) {
    if (isSupportedModelFilename(dropped.path)) designs.push({ source: dropped, companions: [], textures: [] });
    else if (extensionOf(dropped.path) === "csv") manifests.push(dropped);
    else if (isModelCompanionFilename(dropped.path)) extras.push(dropped);
    else leftOut.push({ file: dropped, reason: "Not a CAD file" });
  }

  for (const extra of extras) {
    const format = COMPANION_FOR[extensionOf(extra.path)];
    const owner = ownerAmong(
      format ? companionCandidates(designs, extra.path, format) : textureCandidates(designs, extra.path),
      extra.path,
    );
    if (!owner) {
      const reason = format
        ? `No one ${format.toUpperCase()} file beside it to go with`
        : "No one OBJ or glTF file beside it to go with";
      leftOut.push({ file: extra, reason });
    } else if (format) {
      owner.companions.push(extra);
    } else {
      owner.textures.push(extra);
    }
  }

  designs.sort((a, b) => a.source.path.localeCompare(b.source.path, undefined, { numeric: true }));
  return { designs, manifests, leftOut };
}

/** Files dropped so far with more: a file at a path already there (in any case) replaces it. */
export function mergeDrops(current: DroppedFile[], added: DroppedFile[]): DroppedFile[] {
  const byPath = new Map(current.map((dropped) => [dropped.path.toLowerCase(), dropped]));
  for (const dropped of added) byPath.set(dropped.path.toLowerCase(), dropped);
  return [...byPath.values()];
}

/** Every file a design uploads, its CAD file first. */
export function uploadedFilesOf(design: DesignFiles): DroppedFile[] {
  return [design.source, ...design.companions];
}

/** Bytes a design uploads. */
export function designBytes(design: DesignFiles): number {
  return uploadedFilesOf(design).reduce((total, { file }) => total + file.size, 0);
}
