import * as THREE from "three";
import { SCENE_SETUP_SET_KEY } from "@/features/scene-setups";

/**
 * What a capture shows besides the jewelry. Transparent cutouts are the piece alone: no
 * studio set (floors, plinths, props) and no contact-shadow catcher. Opaque captures keep
 * the set — it is part of the look, and its floor fades into `scene.background`.
 */

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Ground contact-shadow catchers (drawn only where a shadow lands). */
export function isShadowCatcher(mesh: THREE.Mesh): boolean {
  const materials = materialsOf(mesh);
  return (
    materials.length > 0 &&
    materials.every((m) => m instanceof THREE.ShadowMaterial || m.type === "ShadowNodeMaterial")
  );
}

/** Studio-set pieces — scenery, not the piece being sold. */
export function isSetPiece(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node.userData?.[SCENE_SETUP_SET_KEY]) return true;
  }
  return false;
}

export type StageControl = {
  readonly hasSet: boolean;
  showSet(visible: boolean): void;
  showShadows(visible: boolean): void;
  /** Back to the visibility found when the control was created. */
  restore(): void;
};

/** Toggles set pieces and shadow catchers without forgetting what was already hidden. */
export function createStageControl(root: THREE.Object3D): StageControl {
  const shadows: THREE.Mesh[] = [];
  const pieces: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (isShadowCatcher(object)) shadows.push(object);
    else if (isSetPiece(object)) pieces.push(object);
  });
  const initial = new Map<THREE.Mesh, boolean>([...shadows, ...pieces].map((mesh) => [mesh, mesh.visible]));
  const show = (meshes: THREE.Mesh[], visible: boolean) => {
    for (const mesh of meshes) mesh.visible = visible && initial.get(mesh) === true;
  };
  return {
    hasSet: pieces.length > 0,
    showSet: (visible) => show(pieces, visible),
    showShadows: (visible) => show(shadows, visible),
    restore() {
      for (const [mesh, visible] of initial) mesh.visible = visible;
    },
  };
}

/** For transparent exports: hide the set and shadow catchers on a private scene clone. */
export function prepareCutoutScene(scene: THREE.Object3D): void {
  const stage = createStageControl(scene);
  stage.showSet(false);
  stage.showShadows(false);
}

/** Whether the live scene currently shows a studio set (not just the default sweep). */
export function sceneHasStudioSet(scene: THREE.Object3D | null | undefined): boolean {
  return scene ? createStageControl(scene).hasSet : false;
}
