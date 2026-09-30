import { Rhino3dmLoader } from "three/examples/jsm/loaders/3DMLoader.js";
import { Object3D } from "three";

type RhinoObjectAttributes = {
  id?: string;
  layerIndex?: unknown;
  materialIndex?: unknown;
  materialSource?: { name?: string } | null;
};

type RhinoObject = {
  objectType?: string;
  geometry?: { parentIdefId?: string };
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
    const root = original.call(this, data);
    if (root instanceof Object3D) restoreRhinoInstanceAttributes(root, data);
    return root;
  };

  proto.__dvjPatched = true;
}

/** Three appends block groups in definition/reference order but drops their attributes. */
export function restoreRhinoInstanceAttributes(root: Object3D, data: RhinoDecodeData): void {
  const objects = data.objects ?? [];
  const references = objects.filter((object) => object.objectType === "InstanceReference");
  const ordered = objects
    .filter((object) => object.objectType === "InstanceDefinition")
    .flatMap((definition) => references.filter((reference) =>
      reference.geometry?.parentIdefId === definition.attributes?.id));
  const groups = root.children.slice(root.children.length - ordered.length);
  if (!ordered.length || groups.length !== ordered.length) return;
  groups.forEach((group, index) => {
    group.userData.rhinoInstanceAttributes = ordered[index].attributes;
  });
}
