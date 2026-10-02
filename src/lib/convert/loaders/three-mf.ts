import { Unzip, UnzipInflate } from "fflate";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { mmPerThreeMfUnit } from "../model-units";
import type { FormatLoader } from "../types";

/** The root model part (sub-models live deeper, under 3D/Objects/). */
const MODEL_ENTRY_RE = /^3D\/[^/]*\.model$/i;
const UNIT_ATTRIBUTE_RE = /<model\b[^>]*?\bunit\s*=\s*["']([a-z]+)["']/i;
/** The `<model>` element sits at the top of the part; never inflate past this. */
const MAX_HEADER_CHARS = 16_384;

/**
 * The `unit` attribute of the 3MF model part. Three's loader parses it but does not expose it,
 * so only the head of the part is inflated here — the mesh body can be tens of megabytes.
 */
export function readThreeMfUnit(data: Uint8Array): string | null {
  let unit: string | null = null;
  let done = false;
  const unzip = new Unzip((entry) => {
    if (done || !MODEL_ENTRY_RE.test(entry.name)) return;
    const decoder = new TextDecoder();
    let head = "";
    entry.ondata = (error, chunk, final) => {
      if (done) return;
      if (!error) head += decoder.decode(chunk, { stream: !final });
      const match = head.match(UNIT_ATTRIBUTE_RE);
      if (match) unit = match[1];
      if (error || match || final || head.length > MAX_HEADER_CHARS || head.includes("<resources")) {
        done = true;
        entry.terminate();
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  unzip.push(data, true);
  return unit;
}

export const loadThreeMf: FormatLoader = async (file) => {
  const buffer = await file.arrayBuffer();
  const unit = readThreeMfUnit(new Uint8Array(buffer));
  const root = new ThreeMFLoader().parse(buffer);
  return { root, declaredMmPerUnit: mmPerThreeMfUnit(unit), slotSource: "shape" };
};
