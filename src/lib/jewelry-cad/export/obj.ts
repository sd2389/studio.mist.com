import type * as THREE from "three";
import { getCadGem } from "@/lib/jewelry-cad/stones/gem-types";
import type { BuiltPart } from "@/lib/jewelry-cad/types";
import { presetSwatchHex } from "@/lib/material-colors";

/**
 * Wavefront OBJ (+ MTL), millimetres. One `o`/`usemtl` group per slot, so the slot
 * names survive into Rhino, Blender or KeyShot as object names.
 */

export type ObjOptions = { includeStones?: boolean; mtlFileName?: string };

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(5).replace(/\.?0+$/, "") || "0" : "0";
}

function writeGeometry(lines: string[], g: THREE.BufferGeometry, base: number): number {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  for (let i = 0; i < pos.count; i++) lines.push(`v ${fmt(pos.getX(i))} ${fmt(pos.getY(i))} ${fmt(pos.getZ(i))}`);
  if (nor) for (let i = 0; i < nor.count; i++) lines.push(`vn ${fmt(nor.getX(i))} ${fmt(nor.getY(i))} ${fmt(nor.getZ(i))}`);
  const index = g.getIndex();
  const corners = index ? index.count : pos.count;
  for (let c = 0; c < corners; c += 3) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(c + k) : c + k) + base + 1);
    lines.push(nor ? `f ${ids.map((i) => `${i}//${i}`).join(" ")}` : `f ${ids.join(" ")}`);
  }
  return base + pos.count;
}

export function exportObj(parts: BuiltPart[], options: ObjOptions = {}): string {
  const lines = ["# MIST Studio design", "# units: millimetres"];
  if (options.mtlFileName) lines.push(`mtllib ${options.mtlFileName}`);
  let base = 0;
  for (const part of parts) {
    if (part.role !== "metal" && !options.includeStones) continue;
    lines.push(`o ${part.slot}`, `usemtl ${part.slot.replace(/\s+/g, "_")}`);
    base = writeGeometry(lines, part.geometry, base);
  }
  return `${lines.join("\n")}\n`;
}

/** Companion MTL with a plausible colour per slot (metal alloy / gem body colour). */
export function exportMtl(parts: BuiltPart[]): string {
  const lines = ["# MIST Studio design materials"];
  for (const part of parts) {
    const preset = part.role === "metal" && part.metal ? part.metal : part.gem ? getCadGem(part.gem).material : null;
    const hex = (preset && presetSwatchHex(preset)) ?? "#ffffff";
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    lines.push(`newmtl ${part.slot.replace(/\s+/g, "_")}`, `Kd ${fmt(r)} ${fmt(g)} ${fmt(b)}`, part.role === "metal" ? "Ns 400" : "d 0.35", "");
  }
  return lines.join("\n");
}
