/**
 * The CSV manifest a batch can come with, read as the API reads it
 * (backend/app/features/ingest/metadata_csv.py), so its problems show before anything uploads:
 * UTF-8, at most 1 MB, a header row and a row per design; only `file` is required. A row finds
 * its design by the file's relative path, else by a file name only one design has, either way
 * in any case. Rows are numbered as the API numbers them, the header being row 1.
 */
import type { IngestProblem } from "@/lib/api/ingest";
import { MAX_REQUEST_DESIGNS } from "@/lib/api/ingest";
import { baseName } from "@/lib/upload/dropped-files";

export const MANIFEST_COLUMNS = ["file", "sku", "name", "category", "note", "units"] as const;
export type ManifestColumn = (typeof MANIFEST_COLUMNS)[number];
export const MAX_MANIFEST_BYTES = 1024 * 1024;
/** Python's csv.field_size_limit(), which the API's reader keeps. */
const MAX_CELL_LENGTH = 131_072;

export type ManifestRow = {
  /** Its number, the header being row 1. */
  row: number;
  /** By column, trimmed; blank cells left out. */
  cells: Partial<Record<ManifestColumn, string>>;
};

export type ParsedManifest = { rows: ManifestRow[]; problems: IngestProblem[] };

function problem(row: number | null, field: string, code: string, message: string, item: number | null = null): IngestProblem {
  return { item, row, field, code, message };
}

class CsvError extends Error {}

type CsvState = "record" | "field" | "unquoted" | "quoted" | "quote-in-quoted" | "line-end";

/**
 * Records as Python's `csv.reader` reads a text (the excel dialect, not strict): a quoted cell
 * may hold commas, line breaks and doubled quotes; text after a closing quote joins the cell; a
 * blank line is an empty record; an unclosed quote runs to the end. A bare `\r` inside a line is
 * an error there too.
 */
export function readCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let state: CsvState = "record";

  const saveCell = () => {
    if (cell.length > MAX_CELL_LENGTH) throw new CsvError(`field larger than field limit (${MAX_CELL_LENGTH})`);
    record.push(cell);
    cell = "";
  };
  const endLine = () => {
    // The reader's end-of-line step, after each line's last character.
    if (state === "field" || state === "unquoted" || state === "quote-in-quoted") saveCell();
    if (state !== "quoted") {
      records.push(record);
      record = [];
      state = "record";
    }
  };

  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    for (const char of line) {
      const isBreak = char === "\n" || char === "\r";
      if (state === "line-end") {
        if (!isBreak) throw new CsvError("new-line character seen in unquoted field");
        continue;
      }
      if (state === "quoted") {
        if (char === '"') state = "quote-in-quoted";
        else cell += char;
        continue;
      }
      if (state === "quote-in-quoted" && char === '"') {
        cell += char;
        state = "quoted";
        continue;
      }
      if (state === "record" && isBreak) {
        state = "line-end";
        continue;
      }
      if (isBreak) {
        saveCell();
        state = "line-end";
      } else if (char === ",") {
        saveCell();
        state = "field";
      } else if (char === '"' && (state === "record" || state === "field")) {
        state = "quoted";
      } else {
        cell += char;
        state = "unquoted";
      }
    }
    endLine();
  }
  if (state === "quoted") {
    saveCell();
    records.push(record);
  }
  return records;
}

function unknownColumn(name: string): IngestProblem {
  const message = name ? `'${name}' is not a column` : "A column has no name";
  return problem(1, name || "manifest", "column_unknown", `${message}: the columns are ${MANIFEST_COLUMNS.join(", ")}.`);
}

function headerProblems(header: string[]): IngestProblem[] {
  const known = (name: string): name is ManifestColumn => (MANIFEST_COLUMNS as readonly string[]).includes(name);
  const problems = header.filter((name) => !known(name)).map(unknownColumn);
  const repeated = [...new Set(header.filter((name) => known(name) && header.indexOf(name) !== header.lastIndexOf(name)))];
  for (const name of repeated.sort()) {
    problems.push(problem(1, name, "column_repeated", `The header names ${name} twice.`));
  }
  if (!header.includes("file")) problems.push(problem(1, "file", "column_missing", "The header has no file column."));
  return problems;
}

function readRecords(text: string): { records: string[][]; failure: IngestProblem | null } {
  if (new TextEncoder().encode(text).length > MAX_MANIFEST_BYTES) {
    return { records: [], failure: problem(null, "manifest", "manifest_too_large", "The manifest is larger than 1 MB.") };
  }
  let records: string[][];
  try {
    records = readCsvRecords(text.replace(/^﻿/, ""));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { records: [], failure: problem(null, "manifest", "manifest_unreadable", `The manifest isn't a CSV file: ${reason}.`) };
  }
  if (records.length === 0 || !records[0].some((cell) => cell.trim())) {
    return { records: [], failure: problem(1, "manifest", "manifest_empty", "The manifest has no header row.") };
  }
  return { records, failure: null };
}

/**
 * The manifest's rows that name a file, and the problems with the rest. Blank lines are skipped;
 * a header the columns don't match keeps any row from being read.
 */
export function parseManifest(text: string): ParsedManifest {
  const { records, failure } = readRecords(text);
  if (failure) return { rows: [], problems: [failure] };
  const header = records[0].map((cell) => cell.trim().toLowerCase());
  const refused = headerProblems(header);
  if (refused.length > 0) return { rows: [], problems: refused };

  const data = records
    .map((cells, index) => ({ number: index + 1, cells }))
    .slice(1)
    .filter(({ cells }) => cells.some((cell) => cell.trim()));
  if (data.length > MAX_REQUEST_DESIGNS) {
    const message = `The manifest has ${data.length} rows; at most ${MAX_REQUEST_DESIGNS}.`;
    return { rows: [], problems: [problem(null, "manifest", "manifest_too_long", message)] };
  }
  const rows: ManifestRow[] = [];
  const problems: IngestProblem[] = [];
  for (const { number, cells } of data) {
    if (cells.length > header.length) {
      problems.push(problem(number, "manifest", "row_too_long", `The row has ${cells.length} cells for ${header.length} columns.`));
      continue;
    }
    // A row may stop short of the header's last columns: those cells are blank.
    const values: ManifestRow["cells"] = {};
    cells.forEach((value, index) => {
      if (value.trim()) values[header[index] as ManifestColumn] = value.trim();
    });
    if (!values.file) {
      problems.push(problem(number, "file", "file_missing", "The row names no file."));
      continue;
    }
    rows.push({ row: number, cells: values });
  }
  return { rows, problems };
}

/** A path as rows and files are matched: forward slashes, no leading `./` or `/`, any case. */
function matchedPath(path: string): string {
  let cleaned = path.trim().replace(/\\/g, "/");
  while (cleaned.startsWith("./")) cleaned = cleaned.slice(2);
  return cleaned.replace(/^\/+/, "").toLowerCase();
}

/**
 * Each design's row, by the design's index among `paths`: the row naming its relative path, else
 * its file name when only one design has it; and the problems with rows that find none, or one
 * another row found first.
 */
export function matchManifestRows(
  paths: string[],
  rows: ManifestRow[],
): { matched: Map<number, ManifestRow>; problems: IngestProblem[] } {
  const byPath = new Map(paths.map((path, index) => [matchedPath(path), index]));
  const byName = new Map<string, number[]>();
  paths.forEach((path, index) => {
    const name = baseName(matchedPath(path));
    byName.set(name, [...(byName.get(name) ?? []), index]);
  });
  const matched = new Map<number, ManifestRow>();
  const problems: IngestProblem[] = [];
  for (const row of rows) {
    const wanted = matchedPath(row.cells.file ?? "");
    let index = byPath.get(wanted);
    if (index === undefined) {
      const named = byName.get(baseName(wanted)) ?? [];
      if (named.length > 1) {
        const message = `${named.length} files are named ${baseName(wanted)}: give the file's folders too.`;
        problems.push(problem(row.row, "file", "file_ambiguous", message));
        continue;
      }
      index = named[0];
    }
    const earlier = index === undefined ? undefined : matched.get(index);
    if (index === undefined) {
      problems.push(problem(row.row, "file", "file_not_in_batch", `No file of the batch is ${row.cells.file}.`));
    } else if (earlier) {
      const message = `Row ${earlier.row} is ${paths[index]}'s row already.`;
      problems.push(problem(row.row, "file", "file_listed_twice", message, index));
    } else {
      matched.set(index, row);
    }
  }
  return { matched, problems };
}
