import { strToU8, zipSync, type Zippable } from "fflate";
import { buildJewelry } from "@/lib/jewelry-cad/build";
import { exportStl } from "@/lib/jewelry-cad/export/stl";
import { CAD_METALS } from "@/lib/jewelry-cad/units/metals";
import { HALF_RING_SIZES, formatUsSize, ringSizeRow } from "@/lib/jewelry-cad/units/ring-size";
import type { JewelryDesign } from "@/lib/jewelry-cad/types";

/**
 * "All sizes" pack: one metal-only STL per US size (3–13 in half sizes by default), plus
 * a CSV with the inside diameter and metal weight of each size in every alloy.
 */

export type SizePackOptions = {
  sizes?: readonly number[];
  /** File-name stem, e.g. "mist-solitaire". */
  name?: string;
  onProgress?: (done: number, total: number) => void;
};

export function sizeFileName(name: string, size: number): string {
  return `${name}-us-${String(size).replace(".", "_")}.stl`;
}

export function exportAllSizesZip(design: JewelryDesign, options: SizePackOptions = {}): Uint8Array {
  const sizes = options.sizes ?? HALF_RING_SIZES;
  const name = options.name ?? "mist-design";
  const files: Zippable = {};
  const csv = [["us_size", "inside_diameter_mm", "eu_size", "metal_volume_mm3", ...CAD_METALS.map((m) => `${m.id}_g`)].join(",")];

  sizes.forEach((size, i) => {
    const built = buildJewelry({ ...design, ringSize: size });
    files[sizeFileName(name, size)] = exportStl(built.parts, { header: `MIST Studio ${name} US ${formatUsSize(size)} - mm` });
    const row = ringSizeRow(size);
    const volume = built.specs.metalVolumeMm3;
    csv.push([size, row.diameterMm.toFixed(2), row.eu, volume.toFixed(1), ...CAD_METALS.map((m) => ((volume / 1000) * m.density).toFixed(2))].join(","));
    options.onProgress?.(i + 1, sizes.length);
  });

  files["sizes.csv"] = strToU8(`${csv.join("\n")}\n`);
  files["README.txt"] = strToU8(
    [
      `MIST Studio — ${name}`,
      "",
      "One watertight, metal-only STL per US ring size. Units: millimetres.",
      "Stone seats are not cut: drill or burr seats to your setter's spec before casting.",
      "sizes.csv lists the inside diameter and estimated metal weight per alloy.",
      "",
    ].join("\n"),
  );
  return zipSync(files, { level: 6 });
}
