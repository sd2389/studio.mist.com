import * as THREE from "three";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { detectSlots } from "@/lib/slot-materials/detect-slots";

export type SlotStampOptions = {
  modelConfig?: PersistedModelConfig;
  slotTokens?: Record<string, string[]>;
  materialProps?: Record<string, { visible: boolean }>;
};

export function stampSlotMetadata(
  root: THREE.Object3D,
  options: SlotStampOptions = {},
): Record<string, { visible: boolean }> {
  const slotTokens = options.slotTokens ?? options.modelConfig?.slotTokens ?? {};
  const materialProps =
    options.materialProps ??
    options.modelConfig?.materialProps ??
    buildDefaultMaterialProps(options.modelConfig);

  const slotMap = detectSlots(root, slotTokens);
  for (const [slotId, meshes] of slotMap.entries()) {
    const visible = materialProps[slotId]?.visible ?? true;
    for (const mesh of meshes) {
      mesh.name = slotId === "default" ? mesh.name || "Metal 01" : slotId;
      mesh.visible = visible;
      mesh.userData.devjewelsSlot = slotId;
      mesh.userData.devjewelsVisible = visible;
    }
  }

  root.userData.devjewels = {
    slotTokens,
    materialProps,
  };

  return materialProps;
}

function buildDefaultMaterialProps(
  modelConfig?: PersistedModelConfig,
): Record<string, { visible: boolean }> {
  if (!modelConfig?.slots?.length) {
    return { "Metal 01": { visible: true } };
  }
  return Object.fromEntries(
    modelConfig.slots.map((slot) => [slot.slotId, { visible: true }]),
  );
}

export function fitModelToUnit(root: THREE.Object3D, targetSize = 1.4): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxEdge = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxEdge) || maxEdge <= 1e-6) return;
  root.scale.multiplyScalar(targetSize / maxEdge);
}
