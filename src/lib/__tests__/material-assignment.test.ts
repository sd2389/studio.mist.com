import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyMaterialPresetBySlot, snapshotOriginalMaterials } from '@/lib/apply-material-preset';
import { cloneJewelryMaterial } from '@/lib/gem-gpu/clone-jewelry-material';
import { GEM_CONFIGS } from '@/lib/gem-gpu/gem-configs';
import { createGemMaterial } from '@/lib/gem-gpu/gem-physical-material';
import { setJewelryGemTime } from '@/lib/gem-gpu/jewelry-gem-shader';
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
  it('retains working TSL nodes and independent uniforms on a cloned diamond', () => {
    const original = createGemMaterial('diamond');
    const clone = cloneJewelryMaterial(original);
    expect((clone as unknown as {emissiveNode: unknown}).emissiveNode).toBeTruthy();
    expect((clone as unknown as {specularIntensityNode: unknown}).specularIntensityNode).toBeTruthy();
    setJewelryGemTime(clone, 9);
    expect(clone.userData.jewelryGemUniforms.uTime.value).toBe(9);
    expect(original.userData.jewelryGemUniforms.uTime.value).toBe(0);
  });
  it('keeps diamond shading through slot assignment and metal changes', () => {
    const root = new THREE.Group();
    const stone = new THREE.Mesh(new THREE.OctahedronGeometry(),new THREE.MeshPhysicalMaterial());stone.name='Gem 1';
    const band = new THREE.Mesh(new THREE.TorusGeometry(),new THREE.MeshPhysicalMaterial());band.name='Metal 1';
    root.add(stone,band);snapshotOriginalMaterials(root);
    applyMaterialPresetBySlot(root, {'Gem 1':'sapphire','Metal 1':'platinum'},'platinum');
    expect(stone.material.userData.gemGpuDiamond).toBe('sapphire');
    expect((stone.material as unknown as {emissiveNode: unknown}).emissiveNode).toBeTruthy();
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
});
