import { Rhino3dmLoader } from "three/examples/jsm/loaders/3DMLoader.js";

type RhinoObjectAttributes = {
  layerIndex?: unknown;
  materialIndex?: unknown;
  materialSource?: { name?: string } | null;
};

type RhinoObject = {
  attributes?: RhinoObjectAttributes;
};

type RhinoDecodeData = {
  objects?: RhinoObject[];
};

type RhinoLoaderPrototype = {
  _createGeometry?: (data: RhinoDecodeData) => unknown;
  __dvjPatched?: boolean;
};

/**
 * Some 3DM exports include object attributes without materialSource/materialIndex.
 * three's Rhino loader assumes these are always present and crashes the decode pass.
 * We normalize the payload once before _createGeometry runs.
 */
export function ensureRhinoLoaderPatched(): void {
  const proto = Rhino3dmLoader.prototype as unknown as RhinoLoaderPrototype;
  if (proto.__dvjPatched || typeof proto._createGeometry !== "function") return;

  const original = proto._createGeometry;
  proto._createGeometry = function patchedCreateGeometry(this: unknown, data: RhinoDecodeData) {
    for (const obj of data?.objects ?? []) {
      const attrs = obj.attributes;
      if (!attrs) continue;
      if (!attrs.materialSource || typeof attrs.materialSource.name !== "string") {
        attrs.materialSource = { name: "ObjectMaterialSource_MaterialFromObject" };
      }
      if (typeof attrs.materialIndex !== "number") attrs.materialIndex = -1;
      if (typeof attrs.layerIndex !== "number") attrs.layerIndex = -1;
    }
    return original.call(this, data);
  };

  proto.__dvjPatched = true;
}
