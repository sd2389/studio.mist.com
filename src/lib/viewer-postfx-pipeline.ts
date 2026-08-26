import * as THREE from "three";
import { RenderPipeline } from "three/webgpu";
import { float, mix, mrt, normalView, output, pass, renderOutput, vec3, vec4 } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { smaa } from "three/addons/tsl/display/SMAANode.js";
import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { applyViewerColorManagement } from "@/lib/render-color-management";
import type { PostFXQuality, ViewerPostFXConfig } from "@/lib/viewer-postfx-config";

export type ViewerPostFXComposer = {
  render: () => void;
  dispose: () => void;
};

export type ViewerPostFXHandle = {
  composer: ViewerPostFXComposer;
  dispose: () => void;
};

function aoSamplesForQuality(quality: PostFXQuality): number {
  if (quality === "performance") return 8;
  if (quality === "low") return 10;
  if (quality === "high") return 20;
  if (quality === "ultra") return 24;
  return 16;
}

function configureAoPass(
  aoPass: ReturnType<typeof ao>,
  config: ViewerPostFXConfig["ao"],
): void {
  aoPass.resolutionScale = config.halfRes ? 0.5 : 1;
  aoPass.radius.value = config.aoRadius * 0.2;
  aoPass.distanceFallOff.value = config.distanceFalloff;
  aoPass.samples.value = aoSamplesForQuality(config.quality);
}

function buildOutputNode(
  scene: THREE.Scene,
  camera: THREE.Camera,
  config: ViewerPostFXConfig,
) {
  const scenePass = pass(scene, camera);
  if (config.aoEnabled) {
    scenePass.setMRT(mrt({ output, normal: normalView }));
  }

  const sceneColor = scenePass.getTextureNode("output");
  let composed = sceneColor as unknown as ReturnType<typeof sceneColor.mul>;

  if (config.aoEnabled) {
    const aoPass = ao(scenePass.getTextureNode("depth"), scenePass.getTextureNode("normal"), camera);
    configureAoPass(aoPass, config.ao);
    const aoFactor = mix(float(1), aoPass.getTextureNode().r, float(config.ao.intensity));
    composed = sceneColor.mul(vec4(vec3(aoFactor), 1));
  }

  const bloomPass = bloom(
    composed as unknown as Parameters<typeof bloom>[0],
    config.bloom.intensity,
    config.bloom.radius,
    config.bloom.luminanceThreshold,
  );
  bloomPass.smoothWidth.value = config.bloom.luminanceSmoothing;

  const toned = renderOutput(
    composed.add(bloomPass),
    THREE.ACESFilmicToneMapping,
    THREE.SRGBColorSpace,
  );
  return smaa(toned);
}

/**
 * Bloom + GTAO + ACES + SMAA on WebGPURenderer's TSL RenderPipeline.
 * Replaces the WebGL-only pmndrs/postprocessing + N8AO stack.
 */
export function createViewerPostFXComposer(
  renderer: ViewerRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  _width: number,
  _height: number,
  config: ViewerPostFXConfig,
  exposure = 1,
): ViewerPostFXHandle {
  applyViewerColorManagement(renderer, exposure);

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = buildOutputNode(scene, camera, config);
  pipeline.needsUpdate = true;

  const composer: ViewerPostFXComposer = {
    render: () => {
      pipeline.render();
    },
    dispose: () => {
      pipeline.dispose();
    },
  };

  return {
    composer,
    dispose: composer.dispose,
  };
}

export function renderWithPostFX(composer: ViewerPostFXComposer): void {
  composer.render();
}
