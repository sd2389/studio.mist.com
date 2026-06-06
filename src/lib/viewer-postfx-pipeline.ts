import * as THREE from "three";
import { HalfFloatType } from "three";
import { N8AOPostPass } from "n8ao";
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  KernelSize,
  NormalPass,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  BlendFunction,
  ToneMappingMode,
} from "postprocessing";
import { applyViewerColorManagement } from "@/lib/render-color-management";
import type { ViewerPostFXConfig } from "@/lib/viewer-postfx-config";

export type ViewerPostFXComposer = {
  composer: EffectComposer;
  dispose: () => void;
};

function configureN8AOPass(
  pass: N8AOPostPass,
  config: ViewerPostFXConfig["ao"],
  enabled: boolean,
): void {
  Object.assign(pass.configuration, {
    aoRadius: config.aoRadius,
    distanceFalloff: config.distanceFalloff,
    intensity: config.intensity,
    denoiseRadius: config.denoiseRadius,
    halfRes: config.halfRes,
    depthAwareUpsampling: config.depthAwareUpsampling,
  });
  pass.setQualityMode(config.quality.charAt(0).toUpperCase() + config.quality.slice(1));
  pass.enabled = enabled;
}

/**
 * Builds the same bloom + N8AO + ACES + SMAA pipeline used by the live viewport,
 * for offscreen 4K/8K export and turntable video capture.
 */
export function createViewerPostFXComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  config: ViewerPostFXConfig,
  exposure = 1,
): ViewerPostFXComposer {
  applyViewerColorManagement(renderer, exposure);

  const composer = new EffectComposer(renderer, {
    multisampling: 0,
    frameBufferType: HalfFloatType,
  });
  composer.setSize(width, height, false);

  composer.addPass(new RenderPass(scene, camera));

  const normalPass = new NormalPass(scene, camera);
  normalPass.enabled = config.aoEnabled;
  composer.addPass(normalPass);

  const n8aoPass = new N8AOPostPass(scene, camera, width, height);
  configureN8AOPass(n8aoPass, config.ao, config.aoEnabled);

  composer.addPass(n8aoPass);

  const bloomEffect = new BloomEffect({
    blendFunction: BlendFunction.ADD,
    intensity: config.bloom.intensity,
    luminanceThreshold: config.bloom.luminanceThreshold,
    luminanceSmoothing: config.bloom.luminanceSmoothing,
    mipmapBlur: config.bloom.mipmapBlur,
    radius: config.bloom.radius,
    kernelSize: KernelSize.LARGE,
  });

  const toneMappingEffect = new ToneMappingEffect({
    mode: ToneMappingMode.ACES_FILMIC,
  });

  const smaaEffect = new SMAAEffect();
  composer.addPass(new EffectPass(camera, bloomEffect, toneMappingEffect, smaaEffect));

  return {
    composer,
    dispose: () => {
      composer.dispose();
    },
  };
}

export function renderWithPostFX(composer: EffectComposer, renderer: THREE.WebGLRenderer): void {
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = true;
  composer.render(0);
  renderer.autoClear = prevAutoClear;
}
