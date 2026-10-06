import type { ModelUnits } from "@/lib/convert/model-units";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import type { ConvertedUpload } from "@/lib/upload/convert-upload";
import type { SlotRole } from "@/lib/upload/slot-roles";
import { ConvertFailure, type ConvertSpec } from "./convert-job";

/**
 * conversion.json, what converting a design found, exactly as the API reads it (ConversionReport
 * in backend/app/features/ingest/conversions.py): the model config and default materials the
 * upload page would have saved, the triangles counted, how the piece was sized, each slot's role,
 * and what was assumed or changed on the way, in words for the batch page.
 */
export type ConversionReport = {
  model_config: PersistedModelConfig;
  slot_selections: Record<string, string>;
  polygon_count: number;
  units: { mm_per_unit: number; source: ModelUnits["source"]; size_mm: [number, number, number] };
  roles: Record<string, SlotRole>;
  warnings: string[];
};

/** The API's limits on a report (ConversionUnits, ConversionReport). */
const MAX_SIZE_MM = 100_000;
const MAX_MM_PER_UNIT = 1_000_000;
const MAX_WARNINGS = 100;
const MAX_WARNING_LENGTH = 500;

const UNIT_NAMES: Record<number, string> = { 0.001: "microns", 1: "millimetres", 10: "centimetres", 25.4: "inches", 1000: "metres" };

const unitName = (mmPerUnit: number) => UNIT_NAMES[mmPerUnit] ?? `units of ${mmPerUnit} mm`;
const millimetres = (value: number) => (value >= 100 ? value.toFixed(0) : value.toFixed(1));
const describeSize = (sizeMm: readonly number[]) => `${sizeMm.map(millimetres).join(" × ")} mm`;
const count = (value: number) => value.toLocaleString("en-US");

/**
 * What the batch page should know about how the piece was sized: a unit guessed from its size,
 * millimetres taken as they come, or a unit the batch gave that the file's own replaced.
 */
export function unitWarnings(units: ModelUnits, requested: ConvertSpec["units"]): string[] {
  const size = describeSize(units.sizeMm);
  const warnings: string[] = [];
  if (requested !== "auto" && units.source !== "override") {
    warnings.push(`The file gives its own unit, so the batch's "${requested}" was not used.`);
  }
  if (units.source === "assumed") warnings.push(`The file's unit was taken to be millimetres: it is ${size}.`);
  if (units.source === "detected") warnings.push(`The file's unit was guessed from its size as ${unitName(units.mmPerUnit)}: it is ${size}.`);
  return warnings;
}

/** Slots whose role comes from their name, since none of their meshes says what it is. */
export function roleWarnings(assumed: readonly string[], roles: Record<string, SlotRole>): string[] {
  return assumed.map((slot) => `No mesh in slot "${slot}" says what it is: taken as ${roles[slot]} from the slot's name.`);
}

export function decimationWarning(before: number, after: number, cap: number): string {
  return `Metal was simplified from ${count(before)} to ${count(after)} triangles to fit the plan's ${count(cap)}.`;
}

/** The piece's size as the report gives it, or a failure for a size no piece of jewellery has. */
export function reportedUnits(units: ModelUnits): ConversionReport["units"] {
  const [x, y, z] = units.sizeMm.map((value) => Math.round(value * 1000) / 1000);
  const sizes = [x, y, z];
  const plausible = units.mmPerUnit > 0 && units.mmPerUnit <= MAX_MM_PER_UNIT && sizes.every((value) => Number.isFinite(value) && value >= 0 && value <= MAX_SIZE_MM);
  if (!plausible) {
    throw new ConvertFailure("model_unreadable", `The piece measures ${describeSize(units.sizeMm)}, which no piece of jewellery does: check the file's unit.`);
  }
  return { mm_per_unit: units.mmPerUnit, source: units.source, size_mm: [x, y, z] };
}

/** Within the API's limits: at most 100 warnings, each cut to 500 characters. */
function clipWarnings(warnings: readonly string[]): string[] {
  return warnings.slice(0, MAX_WARNINGS).map((warning) => (warning.length > MAX_WARNING_LENGTH ? `${warning.slice(0, MAX_WARNING_LENGTH - 1)}…` : warning));
}

export function buildConversionReport({
  converted,
  units,
  roles,
  warnings,
}: {
  converted: ConvertedUpload;
  units: ConversionReport["units"];
  roles: Record<string, SlotRole>;
  warnings: readonly string[];
}): ConversionReport {
  return {
    model_config: converted.modelConfig,
    slot_selections: converted.slotSelections,
    polygon_count: converted.polygonCount,
    units,
    roles,
    warnings: clipWarnings(warnings),
  };
}
