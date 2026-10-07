import { describe, expect, it } from "vitest";
import type { ModelUnits } from "@/lib/convert/model-units";
import { buildModelConfigFromSlots } from "@/lib/slot-materials/model-config";
import type { ConvertedUpload } from "@/lib/upload/convert-upload";
import { buildConversionReport, decimationWarning, reportedUnits, roleWarnings, unitWarnings } from "./conversion-report";
import { ConvertFailure } from "./convert-job";

const units = (fields: Partial<ModelUnits> = {}): ModelUnits => ({ mmPerUnit: 1, source: "declared", sizeMm: [20.2, 24.4734, 6.5], ...fields });

describe("unitWarnings", () => {
  it("says nothing of a unit the file gives, or the one it came with", () => {
    expect(unitWarnings(units(), "auto")).toEqual([]);
    expect(unitWarnings(units({ mmPerUnit: 10, source: "override" }), "cm")).toEqual([]);
  });

  it("says when the unit was assumed or guessed, and the size it gives", () => {
    expect(unitWarnings(units({ source: "assumed", sizeMm: [2.02, 2.44, 0.61] }), "auto")).toEqual([
      "The file's unit was taken to be millimetres: it is 2.0 × 2.4 × 0.6 mm.",
    ]);
    expect(unitWarnings(units({ mmPerUnit: 25.4, source: "detected" }), "auto")).toEqual([
      "The file's unit was guessed from its size as inches: it is 20.2 × 24.5 × 6.5 mm.",
    ]);
  });

  it("says when the batch's unit gave way to the file's own", () => {
    expect(unitWarnings(units(), "in")).toEqual(['The file gives its own unit, so the batch\'s "in" was not used.']);
  });
});

describe("reportedUnits", () => {
  it("gives the piece's size to the micron", () => {
    expect(reportedUnits(units({ sizeMm: [20.20004, 24.4734, 6.5] }))).toEqual({ mm_per_unit: 1, source: "declared", size_mm: [20.2, 24.473, 6.5] });
  });

  it("fails a size no piece of jewellery has, past what the API takes", () => {
    expect(() => reportedUnits(units({ source: "assumed", sizeMm: [250_000, 10, 10] }))).toThrow(ConvertFailure);
    expect(() => reportedUnits(units({ sizeMm: [Number.NaN, 1, 1] }))).toThrow(/no piece of jewellery/);
  });
});

it("words the roles taken from slot names, and the decimation", () => {
  expect(roleWarnings(["Pave"], { Pave: "gem" })).toEqual(['No mesh in slot "Pave" says what it is: taken as gem from the slot\'s name.']);
  expect(decimationWarning(152_340, 98_211, 100_000)).toBe("Metal was simplified from 152,340 to 98,211 triangles to fit the plan's 100,000.");
});

describe("buildConversionReport", () => {
  const modelConfig = buildModelConfigFromSlots(["Metal 1", "Gem 1"]);
  const converted = {
    modelConfig,
    slotSelections: { "Metal 1": "gold-14k-yellow", "Gem 1": "diamond" },
    polygonCount: 680,
  } as unknown as ConvertedUpload;

  it("is conversion.json exactly as the API reads it (ConversionReport)", () => {
    const report = buildConversionReport({ converted, units: reportedUnits(units()), roles: { "Metal 1": "metal", "Gem 1": "gem" }, warnings: ["one"] });
    expect(Object.keys(report).sort()).toEqual(["model_config", "polygon_count", "roles", "slot_selections", "units", "warnings"]);
    expect(report).toEqual({
      model_config: modelConfig,
      slot_selections: { "Metal 1": "gold-14k-yellow", "Gem 1": "diamond" },
      polygon_count: 680,
      units: { mm_per_unit: 1, source: "declared", size_mm: [20.2, 24.473, 6.5] },
      roles: { "Metal 1": "metal", "Gem 1": "gem" },
      warnings: ["one"],
    });
    // It goes to the worker as JSON: whole numbers stay whole, as the API's strict types need.
    expect(JSON.stringify(report)).toContain('"polygon_count":680,');
  });

  it("keeps its warnings within the API's limits: 100 of at most 500 characters", () => {
    const warnings = Array.from({ length: 120 }, (_, index) => `${index}`.padEnd(index === 0 ? 900 : 10, "x"));
    const report = buildConversionReport({ converted, units: reportedUnits(units()), roles: {}, warnings });
    expect(report.warnings).toHaveLength(100);
    expect(report.warnings[0]).toHaveLength(500);
    expect(report.warnings[0].endsWith("…")).toBe(true);
  });
});
