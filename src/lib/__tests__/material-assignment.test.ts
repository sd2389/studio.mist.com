import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyMaterialPresetBySlot, snapshotOriginalMaterials } from '@/lib/apply-material-preset';
import { cloneJewelryMaterial } from '@/lib/gem-gpu/clone-jewelry-material';
import { GEM_CONFIGS } from '@/lib/gem-gpu/gem-configs';
import { createGemMaterial } from '@/lib/gem-gpu/gem-physical-material';
import { GEM_STONE_ROW_ATTRIBUTE } from '@/lib/gem-gpu/gem-trace-atlas';
import { getGemTraceUniforms, isGemTraceMaterial } from '@/lib/gem-gpu/gem-trace-material';
import { sanitizeSlotSelections } from '@/lib/slot-materials/material-rules';
import { useCatalogParamsStore } from '@/stores/catalog-params-store';

describe('jewelry material assignment', () => {
  it('preserves each gemstone index of refraction', () => {
    for (const id of Object.keys(GEM_CONFIGS) as (keyof typeof GEM_CONFIGS)[]) {
      const material = createGemMaterial(id);
      expect(material.ior).toBe(GEM_CONFIGS[id].ior);
      material.dispose();
    }
  });
  it('rebuilds an independent trace on a cloned diamond', () => {
    const original = createGemMaterial('diamond');
    getGemTraceUniforms(original)!.envRotation.value = 1.25;
    const clone = cloneJewelryMaterial(original);
    expect(isGemTraceMaterial(clone)).toBe(true);
    const originalUniforms = getGemTraceUniforms(original)!;
    const cloneUniforms = getGemTraceUniforms(clone)!;
    expect(cloneUniforms).not.toBe(originalUniforms);
    expect(cloneUniforms.envRotation.value).toBe(1.25);
    cloneUniforms.envIntensity.value = 3;
    expect(originalUniforms.envIntensity.value).toBe(1);
    expect(clone.customProgramCacheKey()).not.toBe(original.customProgramCacheKey());
  });
  it('keeps diamond shading through slot assignment and metal changes', () => {
    const root = new THREE.Group();
    const stone = new THREE.Mesh(new THREE.OctahedronGeometry(),new THREE.MeshPhysicalMaterial());stone.name='Gem 1';
    const band = new THREE.Mesh(new THREE.TorusGeometry(),new THREE.MeshPhysicalMaterial());band.name='Metal 1';
    root.add(stone,band);snapshotOriginalMaterials(root);
    applyMaterialPresetBySlot(root, {'Gem 1':'sapphire','Metal 1':'platinum'},'platinum');
    expect(stone.material.userData.gemGpuDiamond).toBe('sapphire');
    expect(isGemTraceMaterial(stone.material as THREE.Material)).toBe(true);
    // Assignment prepares the stone for tracing: faceted and registered in the plane atlas.
    expect(stone.geometry.getAttribute(GEM_STONE_ROW_ATTRIBUTE)).toBeTruthy();
    applyMaterialPresetBySlot(root, {'Gem 1':'sapphire','Metal 1':'gold-18k-rose'},'gold-18k-rose');
    expect(stone.material.userData.gemGpuDiamond).toBe('sapphire');
    expect(band.material.metalness).toBe(1);
  });
  it('preserves catalog gems before hydration and enforces role after hydration', () => {
    const selected = {'Gem 1':'catalog:test-sapphire' as const};
    expect(sanitizeSlotSelections(selected)).toEqual(selected);
    useCatalogParamsStore.getState().registerGem('test-sapphire',{ior:1.77});
    expect(sanitizeSlotSelections(selected)).toEqual(selected);
    expect(sanitizeSlotSelections({'Metal 1':'catalog:test-sapphire'})).toEqual({'Metal 1':'gold-14k-yellow'});
  });
  it('lets a slot whose name says neither metal nor stone keep a stone, as a bulk look template gives a Pave layer', () => {
    const selections = {'Pave':'diamond','Metal 1':'diamond','Gem 1':'platinum','Yellow Gold':'gold-18k-yellow'} as const;
    expect(sanitizeSlotSelections(selections)).toEqual({'Pave':'diamond','Metal 1':'gold-14k-yellow','Gem 1':'diamond','Yellow Gold':'gold-18k-yellow'});

    const root = new THREE.Group();
    const pave = new THREE.Mesh(new THREE.OctahedronGeometry(),new THREE.MeshPhysicalMaterial());pave.name='Pave';
    const band = new THREE.Mesh(new THREE.TorusGeometry(),new THREE.MeshPhysicalMaterial());band.name='Metal 1';
    root.add(pave,band);snapshotOriginalMaterials(root);
    applyMaterialPresetBySlot(root, {'Pave':'diamond','Metal 1':'platinum'},'original',{'Pave':['pave'],'Metal 1':['metal 1']});
    expect(pave.material.userData.gemGpuDiamond).toBe('diamond');
    expect(band.material.metalness).toBe(1);
  });
});
