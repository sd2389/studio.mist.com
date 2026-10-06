import { describe, expect, it } from "vitest";
import type { IngestItem } from "@/lib/api/ingest";
import type { BulkUploadLimits } from "@/lib/billing/types";
import type { DroppedFile } from "@/lib/upload/dropped-files";
import { batchCreateBody, designUploads, sortProblems } from "./batch-request";
import { heldSkuProblems, planDesigns, planRefusal, skusToCheck, withoutProblems } from "./design-checks";
import { groupDesignFiles } from "./design-files";
import { parseManifest } from "./manifest";
import { resumeUploads } from "./resume-uploads";

const MB = 1024 ** 2;
const GB = 1024 ** 3;

function dropped(path: string, size = 10): DroppedFile {
  const file = new File([], path.split("/").at(-1)!);
  Object.defineProperty(file, "size", { value: size });
  return { path, file };
}

function planOf(files: DroppedFile[], manifest: string | null = null) {
  return planDesigns(groupDesignFiles(files).designs, manifest === null ? null : parseManifest(manifest), "Ring", 100 * MB);
}

function item(fields: Partial<IngestItem> & Pick<IngestItem, "id" | "position" | "filename" | "bytes">): IngestItem {
  return {
    batch_id: 31,
    companions: [],
    sku: "R-1",
    name: "R-1",
    category: "Ring",
    note: null,
    units: "auto",
    status: "awaiting_upload",
    error: null,
    error_code: null,
    attempts: 0,
    scene_id: null,
    convert_job_id: null,
    model_credit_held: 0,
    render_credits_held: 0,
    polygon_count: null,
    size_mm: null,
    warnings: [],
    created_at: "2026-10-06T09:00:00Z",
    updated_at: "2026-10-06T09:00:00Z",
    ...fields,
  };
}

describe("planDesigns without a manifest", () => {
  it("names each design and gives it a SKU from its file name, as the upload page does", () => {
    const plan = planOf([dropped("rings/Solitaire 1ct.3dm"), dropped("P-220.stp")]);

    expect(plan.problems).toEqual([]);
    expect(plan.designs.map(({ sku, name, category, row }) => [sku, name, category, row])).toEqual([
      ["P-220", "P-220", "Ring", null],
      ["Solitaire-1ct", "Solitaire 1ct", "Ring", null],
    ]);
  });

  it("refuses a path longer than the API's filename takes, though its file name is short", () => {
    const deep = `${"folder/".repeat(80)}R-1.stl`;
    expect(planOf([dropped(deep)]).problems).toContainEqual(
      expect.objectContaining({ field: "filename", code: "filename_invalid", message: `'${deep}' is longer than 512 characters.` }),
    );
  });

  it("finds companions sharing a name, and SKUs two designs share", () => {
    const plan = planOf([dropped("a/R-1.obj"), dropped("a/R-1.mtl"), dropped("a/r-1.MTL"), dropped("b/R-1.stl")]);

    expect(plan.problems.map(({ item, field, code }) => [item, field, code])).toEqual([
      [0, "companions[1].filename", "companion_repeated"],
    ]);
    const twice = planOf([dropped("a/R-1.stl"), dropped("b/R-1.stl")]);
    expect(twice.problems).toEqual([
      { item: 1, row: null, field: "sku", code: "sku_repeated", message: "R-1 is a/R-1.stl's SKU too." },
    ]);
  });
});

describe("SKUs held elsewhere", () => {
  it("asks about each well-formed SKU once, of the designs with nothing else wrong", () => {
    const plan = planOf([dropped("R-1.stl"), dropped("big/R-2.stl", 101 * MB), dropped("R-3.stl")]);

    expect(skusToCheck(withoutProblems(plan.designs, plan.problems))).toEqual(["R-1", "R-3"]);
  });

  it("words a taken or reserved SKU as the API does, on the design that has it", () => {
    const plan = planOf([dropped("R-1.stl"), dropped("R-2.stl"), dropped("R-3.stl")]);

    expect(heldSkuProblems(plan.designs, { taken: ["R-2"], reserved: ["R-3"] })).toEqual([
      { item: 1, row: null, field: "sku", code: "sku_taken", message: "R-2 is a scene's SKU already." },
      { item: 2, row: null, field: "sku", code: "sku_reserved", message: "R-3 is reserved by a bulk upload in progress." },
    ]);
  });
});

describe("planRefusal", () => {
  const grow: BulkUploadLimits = { max_designs: 100, max_bytes: 5 * GB, max_file_bytes: 100 * MB, max_open_batches: 3 };
  const free: BulkUploadLimits = { max_designs: 0, max_bytes: 0, max_file_bytes: 100 * MB, max_open_batches: 3 };

  it("says what the API's 402 says, before anything is made", () => {
    expect(planRefusal(1, 10, free, "Free")).toBe("Bulk upload is part of Grow and Studio, not Free.");
    expect(planRefusal(101, 10, grow, "Grow")).toBe("A Grow batch holds at most 100 designs; this one has 101.");
    expect(planRefusal(10, 5 * GB + 1, grow, "Grow")).toBe("A Grow batch holds at most 5 GB of files; this one has 5.00 GB.");
    expect(planRefusal(100, 5 * GB, grow, "Grow")).toBeNull();
  });
});

describe("batchCreateBody", () => {
  it("sends each design's files and sizes in order, and the manifest as it was dropped", () => {
    const manifest = "file,sku\nR-1.obj,R-1\n";
    const plan = planOf([dropped("R-1.obj", 20), dropped("R-1.mtl", 3), dropped("textures/a.png"), dropped("P-2.stp", 30)], manifest);

    expect(batchCreateBody(plan.designs, { name: "  Autumn rings ", manifest, defaultCategory: "Pendant" })).toEqual({
      name: "Autumn rings",
      items: [
        { filename: "P-2.stp", bytes: 30, companions: [] },
        { filename: "R-1.obj", bytes: 20, companions: [{ filename: "R-1.mtl", bytes: 3 }] },
      ],
      manifest,
      options: { default_category: "Pendant" },
    });
  });
});

describe("sortProblems", () => {
  it("puts each problem on its design, under the manifest, or over the batch", () => {
    const onDesign = { item: 2, row: 4, field: "sku", code: "sku_taken", message: "R-1 is a scene's SKU already." };
    const onRow = { item: null, row: 7, field: "file", code: "file_not_in_batch", message: "No file of the batch is x.3dm." };
    const onBatch = { item: null, row: null, field: "name", code: "name_invalid", message: "A batch needs a name." };

    const sorted = sortProblems([onRow, onDesign, onBatch]);

    expect([...sorted.byDesign.entries()]).toEqual([[2, [onDesign]]]);
    expect(sorted.manifest).toEqual([onRow]);
    expect(sorted.batch).toEqual([onBatch]);
  });
});

describe("designUploads", () => {
  it("pairs each made item with its design's files by its place in the request", () => {
    const plan = planOf([dropped("R-1.obj"), dropped("R-1.mtl"), dropped("R-2.stl")]);
    const items = [item({ id: 9002, position: 1, filename: "R-2.stl", bytes: 10 }), item({ id: 9001, position: 0, filename: "R-1.obj", bytes: 10 })];

    expect(designUploads(plan.designs, items).map(({ itemId, files }) => [itemId, files.map(({ path }) => path)])).toEqual([
      [9001, ["R-1.obj", "R-1.mtl"]],
      [9002, ["R-2.stl"]],
    ]);
  });
});

describe("resumeUploads", () => {
  const waiting = [
    item({ id: 1, position: 0, filename: "rings/R-1.obj", bytes: 20, companions: [{ filename: "rings/R-1.mtl", bytes: 3 }] }),
    item({ id: 2, position: 1, filename: "rings/R-2.stl", bytes: 10 }),
    item({ id: 3, position: 2, filename: "P-3.stp", bytes: 30 }),
  ];

  it("finds the files dropped again by path, with or without their folder, else by a name only one has", () => {
    const { uploads, missing } = resumeUploads(waiting, [
      dropped("catalog/rings/R-1.obj", 20),
      dropped("catalog/rings/R-1.mtl", 3),
      dropped("R-2.STL", 10),
      dropped("other/P-3.stp", 30),
    ]);

    expect(uploads.map(({ itemId, files }) => [itemId, files.map(({ path, file }) => [path, file.size])])).toEqual([
      [1, [["rings/R-1.obj", 20], ["rings/R-1.mtl", 3]]],
      [2, [["rings/R-2.stl", 10]]],
      [3, [["P-3.stp", 30]]],
    ]);
    expect(missing).toEqual([]);
  });

  it("leaves a design waiting when a file of it is missing or isn't the size it declared", () => {
    const { uploads, missing } = resumeUploads(waiting, [dropped("rings/R-1.obj", 20), dropped("rings/R-2.stl", 11), dropped("P-3.stp", 30)]);

    expect(uploads.map(({ itemId }) => itemId)).toEqual([3]);
    expect(missing.map(({ id }) => id)).toEqual([1, 2]);
  });
});
