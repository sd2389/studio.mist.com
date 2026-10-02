import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { mmPerFbxUnit } from "../model-units";
import type { FormatLoader } from "../types";

export const loadFbx: FormatLoader = async (file, { companions }) => {
  const root = new FBXLoader(companions.manager).parse(await file.arrayBuffer(), "");
  return {
    root,
    declaredMmPerUnit: mmPerFbxUnit(root.userData.unitScaleFactor),
    slotSource: "shape",
  };
};
