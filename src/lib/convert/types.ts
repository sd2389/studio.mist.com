import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";

export type ConvertToGlbOptions = {
  modelConfig?: PersistedModelConfig;
  compress?: boolean;
  generateThumbnail?: boolean;
};

export type ConvertToGlbResult = {
  glb: Blob;
  glbFilename: string;
  thumbnail: Blob | null;
  slotTokens: Record<string, string[]>;
  materialProps: Record<string, { visible: boolean }>;
};

export type LoadedModel = {
  root: import("three").Object3D;
  slotTokens: Record<string, string[]>;
};
