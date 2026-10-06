import { describe, expect, it } from "vitest";
import type { DroppedFile } from "@/lib/upload/dropped-files";
import { planDesigns } from "./design-checks";
import { groupDesignFiles } from "./design-files";
import { matchManifestRows, parseManifest, readCsvRecords } from "./manifest";

describe("readCsvRecords", () => {
  // Each answer is what Python's csv.reader, which the API reads manifests with, gives for it.
  it.each([
    ["file,sku\nrings/R-1.3dm,R-1\n", [["file", "sku"], ["rings/R-1.3dm", "R-1"]]],
    ['a,"b, c",d\r\ne,f\r\n', [["a", "b, c", "d"], ["e", "f"]]],
    ['a,"b\nc",d\ne,f', [["a", "b\nc", "d"], ["e", "f"]]],
    ['a,"b""c"\n', [["a", 'b"c']]],
    ['"a"b,c\n', [["ab", "c"]]],
    ['a,b"c",d\n', [["a", 'b"c"', "d"]]],
    ["\n\na,b\n\n", [[], [], ["a", "b"], []]],
    ["x\n,\n", [["x"], ["", ""]]],
    ['a,"b\n', [["a", "b\n"]]],
    ["a,b,\n", [["a", "b", ""]]],
    ['""', [[""]]],
  ])("reads %j as the API does", (text, records) => {
    expect(readCsvRecords(text)).toEqual(records);
  });

  it("refuses a bare carriage return inside a line, as the API does", () => {
    expect(() => readCsvRecords("a,b\rc,d")).toThrow("new-line character seen in unquoted field");
  });
});

describe("parseManifest", () => {
  it("reads the header in any case, after a byte-order mark, numbering rows as the API does", () => {
    const parsed = parseManifest("﻿File, SKU ,Name\n\nrings/R-1.3dm, R-1 ,Solitaire\nP-2.stp\n");

    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toEqual([
      { row: 3, cells: { file: "rings/R-1.3dm", sku: "R-1", name: "Solitaire" } },
      { row: 4, cells: { file: "P-2.stp" } },
    ]);
  });

  it.each([
    ["file,colour\n", [{ item: null, row: 1, field: "colour", code: "column_unknown", message: "'colour' is not a column: the columns are file, sku, name, category, note, units." }]],
    ["file,sku,\n", [{ item: null, row: 1, field: "manifest", code: "column_unknown", message: "A column has no name: the columns are file, sku, name, category, note, units." }]],
    ["sku,sku\n", [
      { item: null, row: 1, field: "sku", code: "column_repeated", message: "The header names sku twice." },
      { item: null, row: 1, field: "file", code: "column_missing", message: "The header has no file column." },
    ]],
    ["\nfile\n", [{ item: null, row: 1, field: "manifest", code: "manifest_empty", message: "The manifest has no header row." }]],
    ["file\nR-1.stl\rR-2.stl\n", [{ item: null, row: null, field: "manifest", code: "manifest_unreadable", message: "The manifest isn't a CSV file: new-line character seen in unquoted field." }]],
  ])("refuses the manifest %j as a whole", (text, problems) => {
    expect(parseManifest(text)).toEqual({ rows: [], problems });
  });

  it("refuses a manifest over a megabyte", () => {
    const parsed = parseManifest(`file\n${"R.stl\n".repeat(200_000)}`);
    expect(parsed.problems.map((problem) => problem.code)).toEqual(["manifest_too_large"]);
  });
});

describe("matchManifestRows", () => {
  const paths = ["rings/R-1.3dm", "a/model.3dm", "b/model.3dm", "P-1.stp"];
  const row = (number: number, file: string) => ({ row: number, cells: { file } });

  it("finds each row's design by its path, else by a file name only one design has, in any case", () => {
    const { matched, problems } = matchManifestRows(paths, [row(2, "./Rings\\r-1.3DM"), row(3, "p-1.STP"), row(4, "b/model.3dm")]);

    expect([...matched.entries()].map(([index, found]) => [index, found.row])).toEqual([[0, 2], [3, 3], [2, 4]]);
    expect(problems).toEqual([]);
  });

  it("says which rows find no design, or one that two files share, or one another row found first", () => {
    const { problems } = matchManifestRows(paths, [row(2, "R-1.3dm"), row(3, "model.3dm"), row(4, "gone.3dm"), row(5, "rings/R-1.3dm")]);

    expect(problems).toEqual([
      { item: null, row: 3, field: "file", code: "file_ambiguous", message: "2 files are named model.3dm: give the file's folders too." },
      { item: null, row: 4, field: "file", code: "file_not_in_batch", message: "No file of the batch is gone.3dm." },
      { item: 0, row: 5, field: "file", code: "file_listed_twice", message: "Row 2 is rings/R-1.3dm's row already." },
    ]);
  });
});

describe("a drop checked with its manifest", () => {
  // The API's checks (plan_designs in backend/app/features/ingest/designs.py) on this very drop
  // and manifest give the same problems, in the same order, word for word.
  const MANIFEST = [
    "﻿file,SKU,name,category,note,units",
    "rings/R-1001.3dm,R-1001,Solitaire 1 ct,ring,,",
    "",
    "R-2.stl,bad sku,,Tiara,,cm",
    "missing.3dm,M-1,,,,",
    ",,only a name,,,",
    "model.3dm,X-1",
    "rings/R-1001.3dm,R-9",
    "P-1.stp,P-1,Pendant,,,mm",
    "E-1.obj,E-1,,,,furlongs",
    "extra,a,b,c,d,e,f",
    "",
  ].join("\n");
  const FILES: [string, number][] = [
    ["rings/R-1001.3dm", 10],
    ["R-2.stl", 10],
    ["a/model.3dm", 10],
    ["b/model.3dm", 10],
    ["P-1.stp", 10],
    ["E-1.obj", 10],
    ["big.stl", 200 * 1024 * 1024],
    ["dup.stl", 10],
    ["Dup.stl.stl", 0],
  ];
  // Sized without allocating them: only `size` is read.
  const dropped: DroppedFile[] = FILES.map(([path, size]) => {
    const file = new File([], path.split("/").at(-1)!);
    Object.defineProperty(file, "size", { value: size });
    return { path, file };
  });

  it("finds every problem the API would, with the item and row it is about", () => {
    // The designs in request order: the same order the paths were sent in.
    const designs = FILES.map(([path]) => groupDesignFiles(dropped).designs.find((design) => design.source.path === path)!);
    const plan = planDesigns(designs, parseManifest(MANIFEST), "Ring", 100 * 1024 * 1024);

    expect(plan.problems.map(({ item, row, code }) => [item, row, code])).toEqual([
      [null, 6, "file_missing"],
      [null, 11, "row_too_long"],
      [null, 5, "file_not_in_batch"],
      [null, 7, "file_ambiguous"],
      [0, 8, "file_listed_twice"],
      [1, 4, "sku_invalid"],
      [1, 4, "category_unknown"],
      [4, 9, "units_not_needed"],
      [5, 10, "units_unknown"],
      [6, null, "file_too_large"],
      [8, null, "file_empty"],
      // The API's SKU check finds this one next (sku_problems), as "model is item 2's SKU too".
      [3, null, "sku_repeated"],
    ]);
    expect(plan.problems.find((problem) => problem.code === "file_too_large")?.message).toBe(
      "big.stl is 209,715,200 bytes; a file may be at most 100 MB.",
    );
    expect(plan.problems.find((problem) => problem.code === "category_unknown")?.message).toBe(
      "'Tiara' is not a category: Ring, Engagement Ring, Wedding Band, Necklace, Pendant, Earrings, Stud Earrings, Hoop Earrings, Bracelet, Bangle, Anklet, Brooch, Cufflinks, Watch, Other.",
    );
    expect(plan.problems.find((problem) => problem.code === "units_not_needed")?.message).toBe(
      "P-1.stp gives its own units; units are for OBJ, STL and PLY files.",
    );
    expect(plan.problems.find((problem) => problem.code === "sku_repeated")?.message).toBe("model is a/model.3dm's SKU too.");
  });

  it("settles each design's SKU, name, category and units from its row, else its file name", () => {
    const designs = FILES.map(([path]) => groupDesignFiles(dropped).designs.find((design) => design.source.path === path)!);
    const plan = planDesigns(designs, parseManifest(MANIFEST), "Ring", 100 * 1024 * 1024);

    expect([0, 2, 3, 7].map((index) => plan.designs[index]).map(({ index, row, sku, name, category, units }) => [index, row, sku, name, category, units])).toEqual([
      [0, 2, "R-1001", "Solitaire 1 ct", "Ring", "auto"],
      [2, null, "model", "model", "Ring", "auto"],
      [3, null, "model", "model", "Ring", "auto"],
      [7, null, "dup", "dup", "Ring", "auto"],
    ]);
  });
});
