import * as THREE from "three";
import { segmentMeshesIntoSlots } from "./segment-meshes";

/**
 * Turns a freshly parsed mesh-soup model (STL, OBJ, FBX, PLY, 3MF, STEP, IGES) into the
 * studio's slot layout: helper objects are dropped and every mesh is regrouped by
 * shape into `Metal N` / `Gem N` / `Accent N` meshes.
 */

function isHelperObject(object: THREE.Object3D): boolean {
  return (
    object instanceof THREE.Line ||
    object instanceof THREE.Points ||
    object instanceof THREE.Light ||
    object instanceof THREE.Camera ||
    object instanceof THREE.Bone
  );
}

function disposeMesh(mesh: THREE.Mesh): void {
  mesh.geometry?.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) material?.dispose();
}

/** Remove groups left empty once their meshes were regrouped. */
function pruneEmptyGroups(root: THREE.Object3D): void {
  const empty: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object !== root && object.children.length === 0 && !(object instanceof THREE.Mesh)) empty.push(object);
  });
  for (const object of empty) object.removeFromParent();
  if (empty.length > 0) pruneEmptyGroups(root);
}

function bakeInstances(instanced: THREE.InstancedMesh): THREE.BufferGeometry {
  const source = instanced.geometry.index ? instanced.geometry.toNonIndexed() : instanced.geometry;
  const positions = source.getAttribute("position");
  const out = new Float32Array(positions.count * 3 * instanced.count);
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  for (let i = 0; i < instanced.count; i++) {
    instanced.getMatrixAt(i, matrix);
    for (let v = 0; v < positions.count; v++) {
      point.fromBufferAttribute(positions, v).applyMatrix4(matrix);
      point.toArray(out, (i * positions.count + v) * 3);
    }
  }
  if (source !== instanced.geometry) source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(out, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** The gem renderer needs real per-stone geometry, so instancing is baked into plain meshes. */
export function expandInstancedMeshes(root: THREE.Object3D): void {
  const instanced: THREE.InstancedMesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) instanced.push(object);
  });
  for (const source of instanced) {
    const mesh = new THREE.Mesh(bakeInstances(source), source.material);
    mesh.name = source.name;
    mesh.userData = { ...source.userData };
    mesh.matrix.copy(source.matrix);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    source.parent?.add(mesh);
    source.removeFromParent();
    source.geometry.dispose();
  }
}

export function collectRenderableMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.geometry?.getAttribute("position")) meshes.push(object);
  });
  return meshes;
}

/** Regroup all meshes under `root` into jewelry slot meshes, in place. */
export function rebuildAsJewelrySlots(root: THREE.Object3D): void {
  const helpers: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (isHelperObject(object)) helpers.push(object);
  });
  for (const helper of helpers) helper.removeFromParent();

  const meshes = collectRenderableMeshes(root);
  if (meshes.length === 0) throw new Error("No meshes found in this file");
  const slotMeshes = segmentMeshesIntoSlots(meshes, root);
  for (const mesh of meshes) {
    mesh.removeFromParent();
    disposeMesh(mesh);
  }
  pruneEmptyGroups(root);
  root.add(...slotMeshes);
}
