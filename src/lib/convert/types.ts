import type { Object3D } from "three";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { CompanionFiles } from "./companion-files";
import type { ModelUnits, SourceUnit } from "./model-units";

export type ConvertToGlbOptions = {
  modelConfig?: PersistedModelConfig;
  compress?: boolean;
  generateThumbnail?: boolean;
};

export type ConvertToGlbResult = {
  glb: Blob;
  glbFilename: string;
  /** Null when it wasn't asked for or couldn't be rendered (then `warnings` says why). */
  thumbnail: Blob | null;
  slotTokens: Record<string, string[]>;
  materialProps: Record<string, { visible: boolean }>;
  /** What went less well than asked and didn't stop the GLB: no thumbnail, no compression. */
  warnings: string[];
};

export type LoadedModel = {
  root: Object3D;
  slotTokens: Record<string, string[]>;
  /** How the source's units were read and normalised to millimetres. */
  units?: ModelUnits;
};

/** User-facing progress while a file is parsed ("Tessellating STEP…"). */
export type ModelLoadStatus = {
  message: string;
  /** 0–1 when the step reports progress (e.g. downloading the CAD kernel). */
  progress?: number;
};

export type ModelLoadOptions = {
  /** Files picked alongside the model: .mtl, textures, a .gltf's .bin. */
  companions?: File[];
  /** The unit of a file that declares none, instead of guessing it from the size. */
  unit?: SourceUnit | null;
  onStatus?: (status: ModelLoadStatus) => void;
};

/** A format loader's raw result, before the shared jewelry pipeline runs. */
export type ParsedModel = {
  root: Object3D;
  /** Millimetres per file unit when the format declares units; null when it is unitless. */
  declaredMmPerUnit: number | null;
  /**
   * "names": the file's own mesh/layer names drive slots (glTF, 3DM).
   * "shape": meshes are regrouped into Metal/Gem/Accent slots by geometry.
   */
  slotSource: "names" | "shape";
  /** Extra names feeding slot tokens (Rhino layer names). */
  extraSlotNames?: string[];
};

export type FormatLoaderContext = {
  companions: CompanionFiles;
  onStatus: (status: ModelLoadStatus) => void;
};

export type FormatLoader = (file: File, context: FormatLoaderContext) => Promise<ParsedModel>;
