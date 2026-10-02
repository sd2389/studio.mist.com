import { defaultVideoBitrate } from "@/lib/video-codec";
import { resolvePackAngles } from "./angles";
import { packMetalLabel, TURNTABLE_FORMAT_ORDER, TURNTABLE_FORMATS } from "./defaults";
import { metalSlug, packPaths, packRootName, packZipName } from "./naming";
import type {
  CampaignPackConfig,
  PackAngle,
  PackJob,
  PackMetalId,
  PackPlan,
  PackTotals,
  PlanContext,
  ScopeJob,
  SpinJob,
  StillJob,
  TurntableJob,
} from "./types";

/** Rough bytes per pixel, measured on white-background jewelry renders. */
const BYTES_PER_PIXEL = { jpg: 0.09, png: 0.55 } as const;
const MEGA = 1_000_000;

/** Relative cost weights: encode time on top of the render itself. */
const COST = { stillPng: 0.6, stillJpg: 0.3, spinFrame: 1.3, videoFrame: 1.1, scope: 1.6 } as const;

function uniqueMetals(metals: PackMetalId[]): PackMetalId[] {
  return [...new Set(metals)];
}

function planStills(
  config: CampaignPackConfig,
  root: string,
  metal: PackMetalId,
  angles: PackAngle[],
): StillJob[] {
  if (!config.formats.jpg && !config.formats.png) return [];
  const slug = metalSlug(metal);
  const megapixels = (config.stillSize * config.stillSize) / MEGA;
  return angles.map((angle) => ({
    kind: "still",
    id: `still:${slug}:${angle.slug}`,
    label: `${packMetalLabel(metal)} · ${angle.label}`,
    metal,
    angle,
    size: config.stillSize,
    jpgPath: config.formats.jpg ? packPaths.still(root, slug, angle.slug, "jpg") : null,
    pngPath: config.formats.png ? packPaths.still(root, slug, angle.slug, "png") : null,
    units:
      megapixels *
      (1 + (config.formats.png ? COST.stillPng : 0) + (config.formats.jpg ? COST.stillJpg : 0)),
  }));
}

function planSpin(config: CampaignPackConfig, root: string, metal: PackMetalId): SpinJob[] {
  if (!config.spin.enabled || config.spin.frames < 1) return [];
  const slug = metalSlug(metal);
  const { frames, size } = config.spin;
  return [
    {
      kind: "spin",
      id: `spin:${slug}`,
      label: `${packMetalLabel(metal)} · 360° spin`,
      metal,
      size,
      framePaths: Array.from({ length: frames }, (_, i) => packPaths.spinFrame(root, slug, i, frames)),
      units: frames * ((size * size) / MEGA) * COST.spinFrame,
    },
  ];
}

function planTurntables(config: CampaignPackConfig, root: string, metal: PackMetalId): TurntableJob[] {
  if (!config.turntable.enabled) return [];
  const slug = metalSlug(metal);
  const { durationSec, fps } = config.turntable;
  const frameCount = Math.max(1, Math.round(durationSec * fps));
  return TURNTABLE_FORMAT_ORDER.filter((format) => config.turntable.formats.includes(format)).map(
    (format) => {
      const { width, height } = TURNTABLE_FORMATS[format];
      return {
        kind: "turntable",
        id: `turntable:${slug}:${width}x${height}`,
        label: `${packMetalLabel(metal)} · Turntable ${width}×${height}`,
        metal,
        format,
        width,
        height,
        fps,
        durationSec,
        frameCount,
        path: packPaths.turntable(root, slug, width, height),
        units: frameCount * ((width * height) / MEGA) * COST.videoFrame,
      };
    },
  );
}

/** One ASET image per pack (gems do not change with the metal). */
function planScope(config: CampaignPackConfig, context: PlanContext, root: string, metal: PackMetalId): ScopeJob[] {
  if (!config.cutScope || !context.hasTracedGems) return [];
  return [
    {
      kind: "scope",
      id: "scope:aset:top",
      label: "ASET cut-quality scope · Top",
      metal,
      size: config.stillSize,
      path: packPaths.scope(root),
      units: ((config.stillSize * config.stillSize) / MEGA) * COST.scope,
    },
  ];
}

function estimateBytes(job: PackJob): number {
  if (job.kind === "still") {
    const pixels = job.size * job.size;
    return (job.jpgPath ? pixels * BYTES_PER_PIXEL.jpg : 0) + (job.pngPath ? pixels * BYTES_PER_PIXEL.png : 0);
  }
  if (job.kind === "spin") return job.framePaths.length * job.size * job.size * BYTES_PER_PIXEL.jpg;
  if (job.kind === "scope") return job.size * job.size * BYTES_PER_PIXEL.png;
  return (defaultVideoBitrate(job.width, job.height, job.fps) * job.durationSec) / 8;
}

function outputCount(job: PackJob): number {
  if (job.kind === "still") return Number(Boolean(job.jpgPath)) + Number(Boolean(job.pngPath));
  if (job.kind === "spin") return job.framePaths.length;
  return 1;
}

function summarize(jobs: PackJob[], documentCount: number): PackTotals {
  const totals: PackTotals = { stills: 0, videos: 0, spinFrames: 0, scopes: 0, files: documentCount, units: 0, estimatedBytes: 0 };
  for (const job of jobs) {
    totals.units += job.units;
    totals.estimatedBytes += estimateBytes(job);
    totals.files += outputCount(job);
    if (job.kind === "still") totals.stills += outputCount(job);
    if (job.kind === "spin") totals.spinFrames += job.framePaths.length;
    if (job.kind === "turntable") totals.videos += 1;
    if (job.kind === "scope") totals.scopes += 1;
  }
  return totals;
}

/**
 * Expands a pack config into an ordered job list with deterministic paths. Jobs are grouped
 * by metal so each metal is applied once; documents (viewer, embed, README, manifest) are
 * produced by the runner after the renders.
 */
export function planCampaignPack(config: CampaignPackConfig, context: PlanContext): PackPlan {
  const rootName = packRootName(context.identity);
  const metals = uniqueMetals(config.metals);
  const angles = resolvePackAngles(config.angleIds, context.savedPoses);
  const jobs = metals.flatMap((metal, index) => [
    ...planStills(config, rootName, metal, angles),
    ...(index === 0 ? planScope(config, context, rootName, metal) : []),
    ...planSpin(config, rootName, metal),
    ...planTurntables(config, rootName, metal),
  ]);
  const hasSpin = jobs.some((job) => job.kind === "spin");
  const hasEmbed = config.embed && Boolean(context.identity.sku?.trim());
  const documentCount = 2 + (hasSpin ? 1 : 0) + (hasEmbed ? 2 : 0);
  return {
    rootName,
    zipName: packZipName(rootName),
    jobs,
    metals: metals.map((id) => ({ id, slug: metalSlug(id), label: packMetalLabel(id) })),
    angles,
    spinViewerPath: hasSpin ? packPaths.spinViewer(rootName) : null,
    embedPath: hasEmbed ? packPaths.embedPage(rootName) : null,
    embedSnippetPath: hasEmbed ? packPaths.embedSnippet(rootName) : null,
    readmePath: packPaths.readme(rootName),
    manifestPath: packPaths.manifest(rootName),
    totals: summarize(jobs, documentCount),
  };
}

export function planIsEmpty(plan: PackPlan): boolean {
  return plan.jobs.length === 0;
}
