import { THUMB_SIZE } from "@/lib/convert/thumbnail";
import { inspectModelFromFile } from "@/lib/convert/to-glb";
import { convertParsedUpload } from "@/lib/upload/convert-upload";
import { layerRowsOf } from "@/lib/upload/layer-state";
import { buildParsedUpload, decimateParsedUpload, parseErrorMessage, type ParsedUpload } from "@/lib/upload/parsed-upload";
import { slotRoles } from "@/lib/upload/slot-roles";
import {
  buildConversionReport,
  decimationWarning,
  reportedUnits,
  roleWarnings,
  unitWarnings,
  type ConversionReport,
} from "./conversion-report";
import { ConvertFailure, type ConvertSpec } from "./convert-job";

/*
 * One design converted as the upload page saves a file (ADR 0006): parsed and split into metal
 * and stones (inspectModelFromFile, buildParsedUpload), its unit settled, its metal decimated
 * down to the plan's cap as the "Decimate metal" button does, its layers as the page lists them
 * for review, then Save's conversion (convertParsedUpload). Every step is the upload page's own
 * code; only the choices a person makes there are made here by the job's spec.
 */

/** A design's files, as the sink served them, under the names they were dropped with. */
export type DesignFiles = { source: File; companions: File[] };

export type ConvertedDesign = { glb: Blob; thumbnail: Blob | null; report: ConversionReport };

/** How far the conversion has got, 0 to 1. */
type OnProgress = (progress: number) => Promise<void> | void;

const count = (value: number) => value.toLocaleString("en-US");

/** The design parsed as the upload page parses a dropped file; a file it can't read is unreadable. */
async function parseDesign({ source, companions }: DesignFiles, spec: ConvertSpec): Promise<ParsedUpload> {
  try {
    const inspected = await inspectModelFromFile(source, { companions, unit: spec.units === "auto" ? null : spec.units });
    return buildParsedUpload(source, inspected);
  } catch (error) {
    throw new ConvertFailure("model_unreadable", parseErrorMessage(error, source.name));
  }
}

/**
 * The design within the plan's cap: as it is, or with its metal decimated (decimate "auto"). One
 * still over it, or one that may not be decimated, fails: its stones are never simplified.
 */
async function fitToCap(parsed: ParsedUpload, spec: ConvertSpec, warnings: string[]): Promise<ParsedUpload> {
  const cap = spec.max_polygons;
  if (parsed.polyCount <= cap) return parsed;
  const over = `The design has ${count(parsed.polyCount)} triangles, more than the plan's ${count(cap)}`;
  if (spec.decimate === "fail") throw new ConvertFailure("over_polygon_cap", `${over}, and its batch doesn't decimate.`);
  const decimated = await decimateParsedUpload(parsed, cap);
  if (decimated.polyCount > cap) {
    throw new ConvertFailure(
      "over_polygon_cap",
      `${over}, and simplifying its metal brought it only to ${count(decimated.polyCount)}: its stones, which are never simplified, take too much of it.`,
    );
  }
  warnings.push(decimationWarning(parsed.polyCount, decimated.polyCount, cap));
  return decimated;
}

/** The thumbnail as the job plans it, a WebP; a browser that made another kind gives none. */
function checkedThumbnail(thumbnail: Blob | null, warnings: string[]): Blob | null {
  if (!thumbnail || thumbnail.type === "image/webp") return thumbnail;
  warnings.push(`The thumbnail came out as ${thumbnail.type || "an unknown kind of image"}, not WebP, so the piece has none.`);
  return null;
}

/** Converts one design as its job's spec says, or fails with the reason the job ends. */
export async function convertDesign(files: DesignFiles, spec: ConvertSpec, onProgress: OnProgress = () => {}): Promise<ConvertedDesign> {
  if (spec.thumbnail.size !== THUMB_SIZE) throw new ConvertFailure("invalid_spec", `invalid convert job: spec.thumbnail.size (thumbnails are ${THUMB_SIZE} px)`);
  const parsedUpload = await parseDesign(files, spec);
  if (!parsedUpload.preloaded.units) throw new ConvertFailure("model_unreadable", "The piece could not be measured.");
  const units = reportedUnits(parsedUpload.preloaded.units);
  const warnings = unitWarnings(parsedUpload.preloaded.units, spec.units);
  await onProgress(0.3);
  const parsed = await fitToCap(parsedUpload, spec, warnings);
  await onProgress(0.5);
  const converted = await convertParsedUpload(parsed, layerRowsOf(parsed.preloaded.root, parsed.modelConfig));
  const { roles, assumed } = slotRoles(parsed.preloaded.root, converted.modelConfig);
  const thumbnail = checkedThumbnail(converted.thumbnail, warnings);
  warnings.push(...roleWarnings(assumed, roles), ...converted.warnings);
  return { glb: converted.glb, thumbnail, report: buildConversionReport({ converted, units, roles, warnings }) };
}
