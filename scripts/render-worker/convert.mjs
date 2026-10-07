import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { ApiError, JobLostError, TooLargeError } from "./api.mjs";
import { JobFailure } from "./failure.mjs";
import { withoutQuery } from "./network.mjs";

/*
 * A `convert` job (ADR 0006, "Conversion jobs"): one design of a bulk upload, its CAD file and the
 * files that file names (an OBJ's MTL and textures, a glTF's buffers), converted by the harness's
 * convert mode, which runs the upload page's Save on them, into model.glb, thumbnail.webp and
 * conversion.json. The worker fetches the files with the job's token, checks the source is what
 * its name says before any parser sees it, and hands them to the page through the sink; then it
 * checks what the page made before it uploads any of it. The page gets the spec and the sink, no
 * storage location and no token.
 */

export const CONVERT_KIND = "convert";

/** The files a convert job makes, as convert_spec.py plans them; the thumbnail is optional. */
const MODEL = "model.glb";
const THUMBNAIL = "thumbnail.webp";
const REPORT = "conversion.json";
const PLANNED = {
  [MODEL]: { contentType: "model/gltf-binary", required: true },
  [THUMBNAIL]: { contentType: "image/webp", required: false, maxBytes: 2 * 1024 * 1024 },
  [REPORT]: { contentType: "application/json", required: true, maxBytes: 1024 * 1024 },
};
export const CONVERT_OUTPUT_NAMES = Object.keys(PLANNED);
/** Where the sink serves the design's files (SOURCE_INPUT, companionInput in src/features/render/harness/convert-job.ts). */
export const SOURCE_INPUT = "/inputs/source";
export const companionInput = (index) => `/inputs/companions/${index}`;
/** What the page reports a design failed with: none is tried again (ConvertFailureCode). */
const PAGE_CODES = new Set(["invalid_spec", "model_unreadable", "over_polygon_cap"]);
/** conversion.json's fields (ConversionReport in backend/app/features/ingest/conversions.py). */
const REPORT_FIELDS = ["model_config", "slot_selections", "polygon_count", "units", "roles", "warnings"];
const ROLES = new Set(["metal", "gem", "accent"]);
const UNIT_SOURCES = new Set(["declared", "detected", "assumed", "override"]);
const SNIFF_BYTES = 4096;
const JSON_CHUNK = 0x4e4f534a;

// ---------------------------------------------------------------------------
// The design's files
// ---------------------------------------------------------------------------

const textStart = (head) => head.toString("latin1").replace(/^\xef\xbb\xbf/, "").trimStart();
const isText = (head) => !head.includes(0);
/** IGES: 80-column records, the first of its Start section, an S in column 73. */
const isIges = (head) => (head.toString("latin1").split(/\r?\n/, 1)[0] ?? "")[72] === "S";
const isBinaryStl = (head, size) => head.length >= 84 && size === 84 + 50 * head.readUInt32LE(80);

/** What each format's files start with (or, for OBJ, are). */
const FORMATS = {
  glb: { label: "binary glTF (GLB)", is: (head) => head.toString("latin1", 0, 4) === "glTF" && head.length >= 8 && head.readUInt32LE(4) === 2 },
  gltf: { label: "glTF", is: (head) => textStart(head).startsWith("{") },
  "3dm": { label: "Rhino 3DM", is: (head) => head.toString("latin1", 0, 23) === "3D Geometry File Format" },
  step: { label: "STEP", is: (head) => textStart(head).startsWith("ISO-10303-21") },
  stp: { label: "STEP", is: (head) => textStart(head).startsWith("ISO-10303-21") },
  iges: { label: "IGES", is: isIges },
  igs: { label: "IGES", is: isIges },
  fbx: { label: "FBX", is: (head) => head.toString("latin1", 0, 21) === "Kaydara FBX Binary  \0" || (isText(head) && head.toString("latin1").includes("FBX")) },
  obj: { label: "OBJ", is: isText },
  stl: { label: "STL", is: (head, size) => isBinaryStl(head, size) || textStart(head).toLowerCase().startsWith("solid") },
  ply: { label: "PLY", is: (head) => /^ply\r?\n/.test(head.toString("latin1", 0, 5)) },
  "3mf": { label: "3MF", is: (head) => head.toString("latin1", 0, 4) === "PK\x03\x04" },
};

async function readHead(filePath, bytes) {
  const handle = await open(filePath);
  try {
    const head = Buffer.alloc(Math.min(bytes, SNIFF_BYTES));
    await handle.read(head, 0, head.length, 0);
    return head;
  } finally {
    await handle.close();
  }
}

/**
 * Fails unless the file starts as its format's files do (ADR 0006, "Security"): a renamed file
 * never reaches the parser its name would pick.
 */
export async function sniffSource(filePath, filename, bytes) {
  const extension = path.extname(filename).slice(1).toLowerCase();
  const format = FORMATS[extension];
  if (!format) throw new JobFailure("model_unreadable", `${filename}: the converter reads no .${extension || "(no extension)"} files.`);
  if (!format.is(await readHead(filePath, bytes), bytes)) {
    throw new JobFailure("model_unreadable", `${filename} is not a ${format.label} file: it doesn't start as one does.`);
  }
}

/** Downloads one of the design's files: exactly the bytes it was uploaded with, or the job can't go on. */
async function downloadFile(job, location, file, dest, signal) {
  let bytes;
  try {
    bytes = await job.download(location, dest, { maxBytes: file.bytes, signal });
  } catch (error) {
    if (error instanceof TooLargeError) throw new JobFailure("input_missing", `${file.filename} is larger than the ${file.bytes} bytes it was uploaded with.`);
    if (error instanceof ApiError && !(error instanceof JobLostError) && [403, 404, 410].includes(error.status)) {
      throw new JobFailure("input_missing", `${file.filename} could not be read: ${error.message}`);
    }
    throw error;
  }
  if (bytes !== file.bytes) throw new JobFailure("input_missing", `${file.filename} is ${bytes} bytes, not the ${file.bytes} it was uploaded with.`);
}

/**
 * Downloads the design's source and companions into `dir`, in the spec's order, and checks the
 * source; resolves with what the sink serves the page: path → file.
 */
export async function downloadConvertInputs(job, payload, dir, signal) {
  const { spec } = payload;
  const locations = [payload.source, ...(payload.companions ?? [])];
  const files = [spec?.source, ...(spec?.companions ?? [])];
  if (!spec?.source || locations.length !== files.length || locations.some((location) => !location?.url && !location?.path)) {
    throw new JobFailure("invalid_spec", "The payload doesn't say where each of the design's files is.");
  }
  const inputs = new Map();
  for (const [index, file] of files.entries()) {
    const dest = path.join(dir, `input-${index}`);
    await downloadFile(job, locations[index], file, dest, signal);
    inputs.set(index === 0 ? SOURCE_INPUT : companionInput(index - 1), dest);
  }
  await sniffSource(inputs.get(SOURCE_INPUT), spec.source.filename, spec.source.bytes);
  return inputs;
}

/** What the page is handed: the spec and limits, never where the files are stored. */
export const convertHandOff = ({ kind, spec, limits }) => ({ kind, spec, limits });

// ---------------------------------------------------------------------------
// What the page made
// ---------------------------------------------------------------------------

/** A binary glTF 2.0 whose header gives its own size and whose chunks fit, the first JSON with a mesh. */
export async function checkGlbFile(filePath, bytes) {
  const fail = (why) => new JobFailure("unknown", `The converted model is not a GLB the API stores: ${why}.`);
  const handle = await open(filePath);
  try {
    const header = Buffer.alloc(20);
    await handle.read(header, 0, 20, 0);
    if (header.toString("latin1", 0, 4) !== "glTF" || header.readUInt32LE(4) !== 2) throw fail("no glTF 2.0 header");
    if (header.readUInt32LE(8) !== bytes) throw fail(`its header says ${header.readUInt32LE(8)} bytes, the file is ${bytes}`);
    const jsonLength = header.readUInt32LE(12);
    if (header.readUInt32LE(16) !== JSON_CHUNK || 20 + jsonLength > bytes) throw fail("its first chunk is not JSON");
    const json = Buffer.alloc(jsonLength);
    await handle.read(json, 0, jsonLength, 20);
    let doc;
    try {
      doc = JSON.parse(json.toString("utf8"));
    } catch {
      throw fail("its JSON chunk doesn't parse");
    }
    if (!String(doc?.asset?.version).startsWith("2.") || !Array.isArray(doc.meshes) || doc.meshes.length === 0) throw fail("it has no meshes");
    for (let offset = 20 + jsonLength; offset < bytes; ) {
      const chunk = Buffer.alloc(8);
      await handle.read(chunk, 0, 8, offset);
      offset += 8 + chunk.readUInt32LE(0);
      if (offset > bytes) throw fail("a chunk runs past the end of the file");
    }
  } finally {
    await handle.close();
  }
}

/** The width and height of a WebP (lossy, lossless or extended), or null for anything else. */
export function webpSize(buffer) {
  if (buffer.length < 30 || buffer.toString("latin1", 0, 4) !== "RIFF" || buffer.toString("latin1", 8, 12) !== "WEBP") return null;
  const chunk = buffer.toString("latin1", 12, 16);
  if (chunk === "VP8 " && buffer.readUIntBE(23, 3) === 0x9d012a) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L" && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  return null;
}

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isWhole = (value) => Number.isInteger(value) && value >= 0;

/** Why conversion.json isn't a report the API reads, or null. The API checks it in full again. */
function reportProblem(report) {
  if (!isRecord(report)) return "it is not an object";
  const fields = Object.keys(report).sort().join(",");
  if (fields !== [...REPORT_FIELDS].sort().join(",")) return `its fields are ${fields}, not ${REPORT_FIELDS.join(", ")}`;
  const { model_config: config, slot_selections: selections, polygon_count: polygons, units, roles, warnings } = report;
  if (!isRecord(config) || !isRecord(selections) || !isRecord(roles) || !Array.isArray(warnings)) return "a field has the wrong type";
  if (!isWhole(polygons)) return "polygon_count is not a whole number";
  const size = units?.size_mm;
  if (!isRecord(units) || !UNIT_SOURCES.has(units.source) || !(units.mm_per_unit > 0) || !Array.isArray(size) || size.length !== 3 || !size.every((value) => value >= 0 && value <= 100_000)) {
    return "units is not {mm_per_unit, source, size_mm: [x, y, z]}";
  }
  if (!Object.values(roles).every((role) => ROLES.has(role))) return "a role is not metal, gem or accent";
  return null;
}

/** conversion.json, read and checked; a design over its cap after the page's decimation fails for good. */
async function checkReport(file, spec) {
  let report;
  try {
    report = JSON.parse(await readFile(file.path, "utf8"));
  } catch {
    throw new JobFailure("unknown", "conversion.json doesn't parse.");
  }
  const problem = reportProblem(report);
  if (problem) throw new JobFailure("unknown", `conversion.json is not a report the API reads: ${problem}.`);
  if (report.polygon_count > spec.max_polygons) {
    throw new JobFailure("over_polygon_cap", `The converted model has ${report.polygon_count} triangles, more than the plan's ${spec.max_polygons}.`);
  }
}

async function checkThumbnail(file, spec) {
  const size = webpSize(await readFile(file.path));
  if (size?.width !== spec.thumbnail.size || size?.height !== spec.thumbnail.size) {
    const found = size ? `${size.width}x${size.height}` : "not a WebP";
    throw new JobFailure("unknown", `thumbnail.webp is ${found}; a convert job's thumbnail is a ${spec.thumbnail.size} px WebP.`);
  }
}

/**
 * The files the page posted, each checked against what the API plans (convert_outputs in
 * backend/app/features/render_jobs/convert_spec.py): their names, types and caps, a real GLB, a
 * WebP of the thumbnail's size and a report within the cap. Each goes up with the width and
 * height the API plans for it.
 */
async function collectConverted(spec, result, sink) {
  const reported = new Map((result?.outputs ?? []).map((output) => [output.name, output]));
  const names = [...reported.keys()];
  if (names.some((name) => !PLANNED[name]) || CONVERT_OUTPUT_NAMES.some((name) => PLANNED[name].required && !reported.has(name))) {
    throw new JobFailure("unknown", `The page made ${names.join(", ") || "nothing"}; a convert job makes ${MODEL}, ${REPORT} and maybe ${THUMBNAIL}.`);
  }
  const outputs = [];
  for (const name of CONVERT_OUTPUT_NAMES.filter((planned) => reported.has(planned))) {
    const planned = PLANNED[name];
    const file = sink.files.get(name);
    if (!file) throw new JobFailure("unknown", `The page reported ${name} but the sink never got it.`);
    if (file.contentType !== planned.contentType) throw new JobFailure("unknown", `${name} came as ${file.contentType}, not ${planned.contentType}.`);
    if (planned.maxBytes && file.bytes > planned.maxBytes) throw new JobFailure("unknown", `${name} is ${file.bytes} bytes, more than the ${planned.maxBytes} it may be.`);
    if (name === MODEL) await checkGlbFile(file.path, file.bytes);
    if (name === REPORT) await checkReport(file, spec);
    if (name === THUMBNAIL) await checkThumbnail(file, spec);
    const side = name === THUMBNAIL ? spec.thumbnail.size : null;
    outputs.push({ name, content_type: planned.contentType, width: side, height: side, label: null, path: file.path, bytes: file.bytes, sha256: file.sha256 });
  }
  return outputs;
}

/** What a convert job's page hands the sink, and the outputs made of it (startOutputs in outputs.mjs). */
export function startConvertOutputs({ spec }) {
  return {
    sink: { names: CONVERT_OUTPUT_NAMES },
    encodes: false,
    finish: (result, sink) => collectConverted(spec, result, sink),
    stop: async () => {},
  };
}

/**
 * Why the page says it couldn't convert the design: what it calls the design's fault (unreadable,
 * over its cap, a spec it can't read) ends the job; anything else may work another time.
 */
export function convertPageFailure(message, result) {
  const code = result?.failure?.code;
  return new JobFailure(PAGE_CODES.has(code) ? code : "unknown", result?.failure?.message || message);
}

/**
 * How a convert job runs (EXPORT_MODE in job.mjs is a render job's): the design's files into the
 * sink, the convert mode, and no catalogue asset, only the converters' vendored files. One of
 * those the page couldn't have stops the job before the page calls the design unreadable: it may
 * convert another time.
 */
export const CONVERT_MODE = {
  page: "convert",
  fetchInputs: async (job, payload, dir, signal) => ({ inputs: await downloadConvertInputs(job, payload, dir, signal) }),
  startOutputs: startConvertOutputs,
  handOff: convertHandOff,
  failure: convertPageFailure,
  assetPrefixes: () => [],
  assetFailure: (error, url) => new JobFailure("unknown", `The converter file ${withoutQuery(url)} could not be served: ${error.message}`),
};
