import { CLEARCOAT_MODEL_URL } from "@/lib/model-url";

/** The attribution a bundled third-party model's licence asks for wherever it is shown. */
export type ModelCredit = {
  title: string;
  author: string;
  sourceUrl: string;
  licence: string;
  licenceUrl: string;
};

const CLEARCOAT_RING: ModelCredit = {
  title: "Clearcoat Ring",
  author: "UX3D GmbH",
  sourceUrl: "https://github.com/KhronosGroup/glTF-Sample-Models/tree/main/2.0/ClearcoatRing",
  licence: "CC BY 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
};

/** The credit to show with a model, or null when the model needs none (ours or uploaded). */
export function modelCreditFor(modelUrl: string): ModelCredit | null {
  return modelUrl === CLEARCOAT_MODEL_URL ? CLEARCOAT_RING : null;
}
