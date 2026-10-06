import type { SourceUnit } from "@/lib/convert/model-units";
import { readSink, type RendererInfo, type SinkAddress } from "./job-payload";

/*
 * A `convert` job as the worker hands it to the harness's convert mode (ADR 0006, "Conversion
 * jobs"): the spec as the API normalised it (backend/app/features/render_jobs/convert_spec.py)
 * and its limits. The page gets no storage location and no token: the worker fetches the design's
 * files and serves them through the sink, the source at `/inputs/source` and each companion at
 * `/inputs/companions/<n>`, in the spec's order. Change the three together.
 */

/** A file of the design, by the name it was dropped with: an OBJ finds its MTL by that name. */
export type ConvertFile = { filename: string; bytes: number };

export type ConvertSpec = {
  source: ConvertFile;
  companions: ConvertFile[];
  /** "auto" judges a unitless file's unit from its size; the others give it. */
  units: "auto" | SourceUnit;
  /** The owner's plan cap, in triangles. */
  max_polygons: number;
  /** "auto" decimates metal down to the cap; "fail" fails a design over it. */
  decimate: "auto" | "fail";
  thumbnail: { size: number; format: "webp" };
};

export type ConvertPayload = { kind: "convert"; spec: ConvertSpec; limits: { max_edge: number; max_runtime_seconds: number } };

/** `window.__RENDER_JOB__` in the convert mode. */
export type ConvertJob = { payload: ConvertPayload; sink: SinkAddress };

/**
 * Why a design can't be converted, as the worker fails its job (FailureCode in
 * backend/app/schemas/render_job.py): none of these is tried again.
 */
export type ConvertFailureCode = "invalid_spec" | "model_unreadable" | "over_polygon_cap";

export class ConvertFailure extends Error {
  constructor(
    readonly code: ConvertFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "ConvertFailure";
  }
}

/** `window.__RENDER_RESULT__` when the convert mode fails: the code the worker fails the job with. */
export type ConvertFailureResult = { failure: { code: ConvertFailureCode | "unknown"; message: string } };

/**
 * `window.__RENDER_RESULT__` once the convert mode is done: the files it posted to the sink, by
 * name and type (the worker measures and checks them), and what would draw here.
 */
export type ConvertResult = { renderer: RendererInfo; outputs: { name: string; content_type: string }[] };

/** The files a convert job makes, in the API's order (OUTPUT_NAMES); the thumbnail is optional. */
export const CONVERT_OUTPUTS = { model: "model.glb", thumbnail: "thumbnail.webp", report: "conversion.json" } as const;
const OUTPUT_NAMES: readonly string[] = [CONVERT_OUTPUTS.model, CONVERT_OUTPUTS.thumbnail, CONVERT_OUTPUTS.report];

/** Where the sink serves the design's files. */
export const SOURCE_INPUT = "/inputs/source";
export const companionInput = (index: number) => `/inputs/companions/${index}`;

const UNITS: readonly ConvertSpec["units"][] = ["auto", "mm", "cm", "in", "m"];
/** As many companions as a design may have (MAX_COMPANIONS). */
const MAX_COMPANIONS = 8;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function invalid(field: string): never {
  throw new ConvertFailure("invalid_spec", `invalid convert job: ${field}`);
}

function readFile(raw: unknown, field: string): ConvertFile {
  if (!isObject(raw) || typeof raw.filename !== "string" || !raw.filename) invalid(`${field}.filename`);
  if (!isPositiveInteger(raw.bytes)) invalid(`${field}.bytes`);
  return { filename: raw.filename, bytes: raw.bytes };
}

function readThumbnail(raw: unknown): ConvertSpec["thumbnail"] {
  if (!isObject(raw) || !isPositiveInteger(raw.size) || raw.format !== "webp") invalid("spec.thumbnail");
  return { size: raw.size, format: "webp" };
}

function readSpec(raw: unknown): ConvertSpec {
  if (!isObject(raw)) invalid("spec");
  const { companions, units, max_polygons, decimate, output_names } = raw;
  if (!Array.isArray(companions) || companions.length > MAX_COMPANIONS) invalid("spec.companions");
  const unit = UNITS.find((known) => known === units);
  if (!unit) invalid("spec.units");
  if (!isPositiveInteger(max_polygons)) invalid("spec.max_polygons");
  if (decimate !== "auto" && decimate !== "fail") invalid("spec.decimate");
  const names = Array.isArray(output_names) ? output_names : [];
  if (names.length !== OUTPUT_NAMES.length || names.some((name, index) => name !== OUTPUT_NAMES[index])) invalid("spec.output_names");
  return {
    source: readFile(raw.source, "spec.source"),
    companions: companions.map((companion, index) => readFile(companion, `spec.companions[${index}]`)),
    units: unit,
    max_polygons,
    decimate,
    thumbnail: readThumbnail(raw.thumbnail),
  };
}

/**
 * The job in `window.__RENDER_JOB__`, checked as far as the page relies on it. The API has
 * validated it in full; this only turns a malformed hand-off into a clear error.
 */
export function readConvertJob(raw: unknown): ConvertJob {
  if (!isObject(raw) || !isObject(raw.payload)) invalid("payload");
  const { payload } = raw;
  if (payload.kind !== "convert") invalid(`kind "${String(payload.kind)}" (the convert mode converts designs)`);
  const limits = payload.limits;
  if (!isObject(limits) || !isPositiveInteger(limits.max_edge) || !isPositiveInteger(limits.max_runtime_seconds)) invalid("limits");
  return {
    payload: { kind: "convert", spec: readSpec(payload.spec), limits: { max_edge: limits.max_edge, max_runtime_seconds: limits.max_runtime_seconds } },
    sink: readSink(raw.sink),
  };
}
