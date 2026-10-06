/**
 * A bulk drop's designs checked as the API checks a new batch's
 * (backend/app/features/ingest/designs.py), so problems show before anything uploads: each
 * file, each design's manifest row, its SKU, name, category, note and units, SKUs against each
 * other and, through `sku-check`, against the platform; and the batch against the plan.
 */
import type { IngestProblem, IngestSkuCheck } from "@/lib/api/ingest";
import type { BulkUploadLimits } from "@/lib/billing/types";
import { JEWELRY_CATEGORIES } from "@/lib/upload/categories";
import { baseName } from "@/lib/upload/dropped-files";
import { skuFromFilename, stemFromFilename } from "@/lib/upload/metadata-from-filename";
import { designBytes, extensionOf, MAX_COMPANIONS, uploadedFilesOf, type DesignFiles } from "./design-files";
import { matchManifestRows, type ManifestRow, type ParsedManifest } from "./manifest";

export const SKU_FORM = /^[A-Za-z0-9._-]{1,64}$/;
export const UNITS = ["auto", "mm", "cm", "in", "m"] as const;
/** Formats whose files carry no unit of their own, so a design may say what its numbers measure. */
const UNITLESS_FORMATS = ["obj", "stl", "ply"];
const MAX_NAME_LENGTH = 255;
const MAX_NOTE_LENGTH = 4096;
const MAX_FILE_NAME_LENGTH = 255;
/** A file's whole relative path, as the API's `filename` takes it (backend/app/schemas/ingest.py). */
const MAX_PATH_LENGTH = 512;
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;
const CONTROL_IN_TEXT = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/; // all but tabs and line breaks
const MB = 1024 ** 2;
const GB = 1024 ** 3;

/** A design of the batch to be, every field settled as the API will settle it. */
export type PlannedDesign = {
  /** Its index in the request: the API's `item`. */
  index: number;
  files: DesignFiles;
  /** Its manifest row, if it has one. */
  row: number | null;
  sku: string;
  name: string;
  category: string;
  note: string | null;
  units: string;
};

export type DesignPlan = { designs: PlannedDesign[]; problems: IngestProblem[] };

function knownCategory(value: string): string | null {
  const wanted = value.trim().toLowerCase();
  return JEWELRY_CATEGORIES.find((category) => category.toLowerCase() === wanted) ?? null;
}

class Report {
  readonly problems: IngestProblem[] = [];

  add(item: number | null, row: number | null, field: string, code: string, message: string) {
    this.problems.push({ item, row, field, code, message });
  }
}

/** Length as Python counts it, in code points: an emoji is one character, not two. */
function characters(text: string): number {
  return [...text].length;
}

function pathProblem(path: string): string | null {
  if (CONTROL_CHARACTERS.test(path) || path.includes("\\")) return "has a backslash or a control character in it";
  if (path.startsWith("/") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    return "is not a relative path";
  }
  if (characters(path) > MAX_PATH_LENGTH) return `is longer than ${MAX_PATH_LENGTH} characters`;
  if (characters(baseName(path)) > MAX_FILE_NAME_LENGTH) return `has a file name longer than ${MAX_FILE_NAME_LENGTH} characters`;
  return null;
}

function checkFiles(report: Report, index: number, design: DesignFiles, maxFileBytes: number | null) {
  uploadedFilesOf(design).forEach(({ path, file }, number) => {
    const field = number === 0 ? "" : `companions[${number - 1}].`;
    const reason = pathProblem(path);
    if (reason) report.add(index, null, `${field}filename`, "filename_invalid", `'${path}' ${reason}.`);
    if (file.size < 1) {
      report.add(index, null, `${field}bytes`, "file_empty", `${baseName(path)} is empty.`);
    } else if (maxFileBytes !== null && file.size > maxFileBytes) {
      const message = `${baseName(path)} is ${file.size.toLocaleString("en-US")} bytes; a file may be at most ${Math.floor(maxFileBytes / MB)} MB.`;
      report.add(index, null, `${field}bytes`, "file_too_large", message);
    }
  });
  const names = new Set([baseName(design.source.path).toLowerCase()]);
  design.companions.forEach(({ path }, number) => {
    const name = baseName(path).toLowerCase();
    if (names.has(name)) {
      report.add(index, null, `companions[${number}].filename`, "companion_repeated", `Another file of this design is named ${baseName(path)}.`);
    }
    names.add(name);
  });
  if (design.companions.length > MAX_COMPANIONS) {
    const message = `${baseName(design.source.path)} brings ${design.companions.length} files with it; a design may bring at most ${MAX_COMPANIONS}.`;
    report.add(index, null, "companions", "companions_too_many", message);
  }
}

/** Records a problem with one field of a design. */
type Refuse = (field: string, code: string, message: string) => void;

function settledSku(refuse: Refuse, path: string, given?: string): string {
  const sku = (given ?? "").trim() || skuFromFilename(path);
  if (!SKU_FORM.test(sku)) {
    refuse("sku", "sku_invalid", `'${sku}' is not a SKU: 1 to 64 letters, digits, dots, hyphens or underscores.`);
  }
  return sku;
}

function settledName(refuse: Refuse, path: string, given?: string): string {
  const name = (given ?? "").trim();
  if (name && (name.length > MAX_NAME_LENGTH || CONTROL_CHARACTERS.test(name))) {
    refuse("name", "name_invalid", `A name is at most ${MAX_NAME_LENGTH} characters, on one line.`);
  }
  return name || stemFromFilename(path);
}

function settledCategory(refuse: Refuse, batchCategory: string, given?: string): string {
  const named = (given ?? "").trim();
  if (!named) return batchCategory;
  const category = knownCategory(named);
  if (!category) refuse("category", "category_unknown", `'${named}' is not a category: ${JEWELRY_CATEGORIES.join(", ")}.`);
  return category ?? "";
}

function settledNote(refuse: Refuse, given?: string): string | null {
  const note = (given ?? "").trim() || null;
  if (note !== null && (note.length > MAX_NOTE_LENGTH || CONTROL_IN_TEXT.test(note))) {
    refuse("note", "note_invalid", `A note is at most ${MAX_NOTE_LENGTH} characters, of text and line breaks.`);
  }
  return note;
}

function settledUnits(refuse: Refuse, path: string, given?: string): string {
  const units = (given ?? "").trim().toLowerCase() || "auto";
  if (!(UNITS as readonly string[]).includes(units)) {
    refuse("units", "units_unknown", `'${units}' is not a unit: ${UNITS.join(", ")}.`);
  } else if (units !== "auto" && !UNITLESS_FORMATS.includes(extensionOf(path))) {
    refuse("units", "units_not_needed", `${baseName(path)} gives its own units; units are for OBJ, STL and PLY files.`);
  }
  return units;
}

/** The design's SKU, name, category, note and units: from its row, else its file name and the batch's category. */
function settle(report: Report, index: number, design: DesignFiles, row: ManifestRow | null, category: string): PlannedDesign {
  const given = row?.cells ?? {};
  const rowNumber = row?.row ?? null;
  const path = design.source.path;
  const refuse: Refuse = (field, code, message) => report.add(index, rowNumber, field, code, message);
  return {
    index,
    files: design,
    row: rowNumber,
    sku: settledSku(refuse, path, given.sku),
    name: settledName(refuse, path, given.name),
    category: settledCategory(refuse, category, given.category),
    note: settledNote(refuse, given.note),
    units: settledUnits(refuse, path, given.units),
  };
}

/** A SKU two designs share. */
function repeatedSkus(report: Report, designs: PlannedDesign[]) {
  const first = new Map<string, PlannedDesign>();
  for (const design of designs) {
    const other = first.get(design.sku);
    if (!other) {
      first.set(design.sku, design);
      continue;
    }
    const message = `${design.sku} is ${other.files.source.path}'s SKU too.`;
    report.add(design.index, design.row, "sku", "sku_repeated", message);
  }
}

/**
 * The designs a drop makes, in request order, and every problem that keeps the batch from being
 * made: the manifest's own, each file's (with the plan's largest file, once known), each
 * design's fields, and SKUs repeated in the batch.
 */
export function planDesigns(
  designs: DesignFiles[],
  manifest: ParsedManifest | null,
  defaultCategory: string,
  maxFileBytes: number | null,
): DesignPlan {
  const report = new Report();
  const batchCategory = knownCategory(defaultCategory);
  if (batchCategory === null) {
    report.add(null, null, "options.default_category", "category_unknown", `'${defaultCategory}' is not a category.`);
  }
  let rows = new Map<number, ManifestRow>();
  if (manifest) {
    report.problems.push(...manifest.problems);
    const matching = matchManifestRows(designs.map((design) => design.source.path), manifest.rows);
    report.problems.push(...matching.problems);
    rows = matching.matched;
  }
  const planned = designs.map((design, index) => {
    checkFiles(report, index, design, maxFileBytes);
    return settle(report, index, design, rows.get(index) ?? null, batchCategory ?? JEWELRY_CATEGORIES[0]);
  });
  // As the API does, SKUs are compared only among designs with nothing else wrong.
  repeatedSkus(report, withoutProblems(planned, report.problems));
  return { designs: planned, problems: report.problems };
}

/** The designs no problem names. */
export function withoutProblems(designs: PlannedDesign[], problems: IngestProblem[]): PlannedDesign[] {
  const named = new Set(problems.map((problem) => problem.item));
  return designs.filter((design) => !named.has(design.index));
}

/**
 * The SKUs `sku-check` found a scene holds or a design in progress reserves, as the API words
 * them; each SKU's first design names it. Pass the designs with nothing else wrong.
 */
export function heldSkuProblems(designs: PlannedDesign[], held: IngestSkuCheck): IngestProblem[] {
  const taken = new Set(held.taken);
  const reserved = new Set(held.reserved);
  const problems: IngestProblem[] = [];
  const seen = new Set<string>();
  for (const design of designs) {
    if (seen.has(design.sku)) continue;
    seen.add(design.sku);
    if (taken.has(design.sku)) {
      problems.push({ item: design.index, row: design.row, field: "sku", code: "sku_taken", message: `${design.sku} is a scene's SKU already.` });
    } else if (reserved.has(design.sku)) {
      const message = `${design.sku} is reserved by a bulk upload in progress.`;
      problems.push({ item: design.index, row: design.row, field: "sku", code: "sku_reserved", message });
    }
  }
  return problems;
}

/** The SKUs worth asking `sku-check` about: well-formed, each once. */
export function skusToCheck(designs: PlannedDesign[]): string[] {
  return [...new Set(designs.map((design) => design.sku).filter((sku) => SKU_FORM.test(sku)))].sort();
}

/** Every byte the batch uploads, companions included. */
export function batchBytes(designs: PlannedDesign[]): number {
  return designs.reduce((total, design) => total + designBytes(design.files), 0);
}

/**
 * Why the plan can't take the batch (the API's 402, word for word), or null: no bulk upload on
 * it, more designs or bytes than a batch of it holds.
 */
export function planRefusal(designCount: number, bytes: number, limits: BulkUploadLimits, planLabel: string): string | null {
  if (limits.max_designs === 0) return `Bulk upload is part of Grow and Studio, not ${planLabel}.`;
  if (designCount > limits.max_designs) {
    return `A ${planLabel} batch holds at most ${limits.max_designs} designs; this one has ${designCount}.`;
  }
  if (bytes > limits.max_bytes) {
    return `A ${planLabel} batch holds at most ${limits.max_bytes / GB} GB of files; this one has ${(bytes / GB).toFixed(2)} GB.`;
  }
  return null;
}
