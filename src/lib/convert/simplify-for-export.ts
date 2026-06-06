import * as THREE from "three";

/** GLTFExporter stalls on transmission/clearcoat-heavy physical materials from Rhino loads. */
export function simplifyMaterialsForExport(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const role = obj.userData.jewelryRole as string | undefined;
    const slot = obj.userData.devjewelsSlot as string | undefined;
    const isGem =
      role === "gem" || slot?.startsWith("Gem") || slot?.startsWith("Accent");

    if (Array.isArray(obj.material)) {
      obj.material.forEach((mat) => mat.dispose());
    } else {
      obj.material?.dispose();
    }

    obj.material = new THREE.MeshStandardMaterial({
      color: isGem ? 0xe8f4ff : 0xd9d4ca,
      metalness: isGem ? 0.05 : 0.85,
      roughness: isGem ? 0.4 : 0.28,
    });
  });
}
