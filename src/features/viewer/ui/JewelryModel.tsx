"use client";

import { Center, Html, useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { GemGpuDiamondShimmer } from "@/components/DiamondGem";
import {
  applyMaterialPreset,
  applyMaterialPresetBySlot,
  disposeObject3D,
  snapshotOriginalMaterials,
} from "@/lib/apply-material-preset";
import { isGemPresetId } from "@/lib/gem-gpu/gem-configs";
import { modelExtFromUrl } from "@/lib/model-key";
import type { ModelTransform, PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { degreesToRadians, normalizeModelTransform } from "@/lib/viewer-scene";
import { detectSlots } from "@/lib/slot-materials/detect-slots";
import { resetModelReady, signalModelReady } from "@/stores/batch-export-store";
import { useMaterialPresetStore, type MaterialPresetId } from "@/stores/material-preset-store";

type JewelryModelProps = {
  url: string;
  preset: MaterialPresetId;
  modelConfig?: PersistedModelConfig;
  modelTransform?: ModelTransform;
};

const FIT_SIZE = 1.4;

export function JewelryModel({ url, preset, modelConfig, modelTransform }: JewelryModelProps) {
  const ext = modelExtFromUrl(url);
  if (ext !== "glb" && ext !== "gltf") {
    return (
      <Html center className="max-w-xs rounded-md border border-border/60 bg-background/90 px-3 py-2 text-center text-xs text-foreground">
        This model is not GLB. Re-upload through the studio to convert legacy STL/3DM files.
      </Html>
    );
  }
  return (
    <GltfJewelryModel
      url={url}
      preset={preset}
      modelConfig={modelConfig}
      modelTransform={modelTransform}
    />
  );
}

function GltfJewelryModel({ url, preset, modelConfig, modelTransform }: JewelryModelProps) {
  const { scene } = useGLTF(url);

  useEffect(() => {
    resetModelReady();
  }, [url]);

  return (
    <PresetWrapper
      raw={scene}
      preset={preset}
      modelConfig={modelConfig}
      modelTransform={modelTransform}
    />
  );
}

function PresetWrapper({
  raw,
  preset,
  modelConfig,
  modelTransform,
}: {
  raw: THREE.Object3D;
  preset: MaterialPresetId;
  modelConfig?: PersistedModelConfig;
  modelTransform?: ModelTransform;
}) {
  const finish = useMaterialPresetStore((s) => s.finish);
  const slotSelections = useMaterialPresetStore((s) => s.slotSelections);
  const model = useMemo(() => {
    const cloned = raw.clone(true);
    fitToUnit(cloned, FIT_SIZE);
    snapshotOriginalMaterials(cloned);
    return cloned;
  }, [raw]);
  const slotTokens = modelConfig?.slotTokens;
  const materialProps = modelConfig?.materialProps;
  const slotMap = useMemo(() => detectSlots(model, slotTokens), [model, slotTokens]);
  const hasSlotAwareModel = useMemo(() => {
    return [...slotMap.keys()].some((slot) => slot !== "default");
  }, [slotMap]);

  useEffect(() => {
    return () => disposeObject3D(model);
  }, [model]);

  useLayoutEffect(() => {
    if (materialProps) {
      for (const [slotId, props] of Object.entries(materialProps)) {
        const meshes = slotMap.get(slotId as Parameters<typeof slotMap.get>[0]);
        if (!meshes) continue;
        for (const mesh of meshes) {
          mesh.visible = props.visible !== false;
        }
      }
    }
  }, [model, materialProps, slotMap]);

  useLayoutEffect(() => {
    if (hasSlotAwareModel) {
      applyMaterialPresetBySlot(model, slotSelections, preset, slotTokens, finish);
    } else {
      applyMaterialPreset(model, preset, finish);
    }
    signalModelReady();
  }, [model, preset, finish, slotSelections, hasSlotAwareModel, slotTokens]);

  const transform = normalizeModelTransform(modelTransform);

  return (
    <group
      position={[transform.position.x, transform.position.y, transform.position.z]}
      rotation={[
        degreesToRadians(transform.rotation.x),
        degreesToRadians(transform.rotation.y),
        degreesToRadians(transform.rotation.z),
      ]}
    >
      <Center>
        <GemGpuDiamondShimmer object={model} active={isGemPresetId(preset)} />
        <primitive object={model} />
      </Center>
    </group>
  );
}

function fitToUnit(obj: THREE.Object3D, targetSize: number): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxEdge = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxEdge) || maxEdge <= 1e-6) return;
  obj.scale.multiplyScalar(targetSize / maxEdge);
}
