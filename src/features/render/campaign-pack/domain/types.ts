import type { Vec3 } from "@/lib/camera-orbit";
import type { MaterialPresetId } from "@/stores/material-preset-store";

export type { Vec3 };

/** A metal preset, or the model exactly as configured (two-tone designs stay intact). */
export type PackMetalId = MaterialPresetId | "current";

export type BuiltInAngleId = "front" | "three-quarter" | "top" | "side";

export type PackAngle =
  | { kind: "preset"; id: BuiltInAngleId; slug: string; label: string; azimuthDeg: number; elevationDeg: number }
  | { kind: "pose"; id: string; slug: string; label: string; position: Vec3; target: Vec3 };

export type TurntableFormatId = "landscape" | "square" | "vertical";

export type PackBackground =
  | { kind: "white" }
  | { kind: "scene" }
  | { kind: "custom"; color: string };

export type CampaignPackConfig = {
  metals: PackMetalId[];
  /** Built-in ids ("front", …) or `pose:<savedPoseId>`. */
  angleIds: string[];
  stillSize: number;
  formats: { jpg: boolean; png: boolean };
  background: PackBackground;
  jpegQuality: number;
  autoFrame: boolean;
  /** Empty border on every side, as a percentage of the frame. */
  marginPct: number;
  contactShadow: boolean;
  turntable: { enabled: boolean; formats: TurntableFormatId[]; durationSec: number; fps: number };
  spin: { enabled: boolean; frames: number; size: number };
  embed: boolean;
  /** ASET cut-quality image of the stones (top view), when the piece has traced gems. */
  cutScope: boolean;
};

export type PackIdentity = {
  modelId: string;
  sku: string | null;
  name: string | null;
};

export type SavedPoseLike = {
  id: string;
  name: string;
  cameraPosition: Vec3;
  target: Vec3;
  isDefault?: boolean;
};

export type PlanContext = {
  identity: PackIdentity;
  savedPoses: SavedPoseLike[];
  /** The piece has ray-traced gems (required for the ASET scope image). */
  hasTracedGems?: boolean;
};

type JobBase = {
  id: string;
  label: string;
  metal: PackMetalId;
  /** Relative render cost (megapixels processed) — drives progress and ETA. */
  units: number;
};

export type StillJob = JobBase & {
  kind: "still";
  angle: PackAngle;
  size: number;
  jpgPath: string | null;
  pngPath: string | null;
};

export type SpinJob = JobBase & {
  kind: "spin";
  size: number;
  framePaths: string[];
};

export type TurntableJob = JobBase & {
  kind: "turntable";
  format: TurntableFormatId;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  frameCount: number;
  path: string;
};

/** ASET false-colour view of the stones, top-down on white. */
export type ScopeJob = JobBase & {
  kind: "scope";
  size: number;
  path: string;
};

export type PackJob = StillJob | SpinJob | TurntableJob | ScopeJob;

export type PackTotals = {
  stills: number;
  videos: number;
  spinFrames: number;
  scopes: number;
  files: number;
  units: number;
  estimatedBytes: number;
};

export type PackPlan = {
  rootName: string;
  zipName: string;
  jobs: PackJob[];
  metals: { id: PackMetalId; slug: string; label: string }[];
  angles: PackAngle[];
  spinViewerPath: string | null;
  embedPath: string | null;
  embedSnippetPath: string | null;
  readmePath: string;
  manifestPath: string;
  totals: PackTotals;
};

export type PackFileRecord = {
  path: string;
  bytes: number;
  kind: "still-jpg" | "still-png" | "spin-frame" | "video" | "scope" | "document";
  metal?: string;
  angle?: string;
  width?: number;
  height?: number;
};

export type PackFailure = {
  jobId: string;
  label: string;
  message: string;
};
