import * as THREE from "three";
import { RenderPipeline } from "three/webgpu";
import { float, mix, mrt, normalView, output, pass, renderOutput, uniform, vec3, vec4, velocity } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { dof } from "three/addons/tsl/display/DepthOfFieldNode.js";
import { ao } from "three/addons/tsl/display/GTAONode.js";
import { smaa } from "three/addons/tsl/display/SMAANode.js";
import { traa } from "three/addons/tsl/display/TRAANode.js";
import type { ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { isGemTraceMaterial } from "@/lib/gem-gpu/gem-trace-material";
import { starGlints } from "@/lib/postfx/star-glint-node";
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

const cameraForward = new THREE.Vector3();
const focusBox = new THREE.Box3();
const focusPoint = new THREE.Vector3();
const toFocus = new THREE.Vector3();
const REFOCUS_EVERY_FRAMES = 30;

function hasTracedGem(object: THREE.Object3D): boolean {
  if (!(object instanceof THREE.Mesh) || !object.visible) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.some(isGemTraceMaterial);
}

/**
 * A jewelry macro shot focuses on the stones, letting the shank fall away; with no traced
 * stone in view the piece's centre (the origin) is the focus.
 */
function findFocusPoint(scene: THREE.Scene, out: THREE.Vector3): THREE.Vector3 {
  focusBox.makeEmpty();
  scene.traverse((object) => {
    if (hasTracedGem(object)) focusBox.expandByObject(object);
  });
  return focusBox.isEmpty() ? out.set(0, 0, 0) : focusBox.getCenter(out);
}

function createFocusTracker(scene: THREE.Scene, camera: THREE.Camera) {
  const focus = uniform(2);
  let frame = 0;
  const update = () => {
    if (frame++ % REFOCUS_EVERY_FRAMES === 0) findFocusPoint(scene, focusPoint);
    camera.getWorldDirection(cameraForward);
    toFocus.copy(focusPoint).sub(camera.position);
    focus.value = Math.max(0.05, cameraForward.dot(toFocus));
  };
  return { focus, update };
}

type FocusUniform = ReturnType<typeof createFocusTracker>["focus"];

function buildOutputNode(
  scene: THREE.Scene,
  camera: THREE.Camera,
  config: ViewerPostFXConfig,
  focus: FocusUniform,
) {
  const temporal = config.temporalAA === true;
  // TRAA resolves edges itself and copies the depth buffer, which must not be multisampled.
  const scenePass = pass(scene, camera, temporal ? { samples: 0 } : {});
  if (config.aoEnabled || temporal) {
    scenePass.setMRT(
      mrt({
        output,
        ...(config.aoEnabled ? { normal: normalView } : {}),
        ...(temporal ? { velocity } : {}),
      }),
    );
  }

  const sceneColor = scenePass.getTextureNode("output");
  let composed = sceneColor as unknown as ReturnType<typeof sceneColor.mul>;

  if (config.aoEnabled) {
    const aoPass = ao(scenePass.getTextureNode("depth"), scenePass.getTextureNode("normal"), camera);
    configureAoPass(aoPass, config.ao);
    const aoFactor = mix(float(1), aoPass.getTextureNode().r, float(config.ao.intensity));
    composed = sceneColor.mul(vec4(vec3(aoFactor), 1));
  }

  if (temporal) {
    const resolved = traa(composed, scenePass.getTextureNode("depth"), scenePass.getTextureNode("velocity"), camera);
    composed = resolved as unknown as typeof composed;
  }

  if (config.dof.enabled) {
    // Macro lens: a shallow focal band around the piece, the look of a jewelry macro shot.
    const blurred = dof(composed, scenePass.getViewZNode(), focus, config.dof.focalRange, config.dof.bokehScale);
    composed = blurred as unknown as typeof composed;
  }

  const bloomPass = bloom(
    composed as unknown as Parameters<typeof bloom>[0],
    config.bloom.intensity,
    config.bloom.radius,
    config.bloom.luminanceThreshold,
  );
  bloomPass.smoothWidth.value = config.bloom.luminanceSmoothing;

  // Glows add light, never coverage: alpha comes from the scene pass itself (DOF and the
  // glow passes all write opaque alpha), so transparent captures stay transparent.
  const coverage = sceneColor.a;
  let glow = bloomPass.rgb;
  if (config.stars.enabled) {
    const stars = starGlints(composed, config.stars.threshold, config.stars.intensity, config.stars.reach);
    glow = glow.add((stars as unknown as typeof bloomPass).rgb);
  }
  const lit = vec4(composed.rgb.add(glow), coverage);

  const toned = renderOutput(
    lit,
    THREE.NeutralToneMapping,
    THREE.SRGBColorSpace,
  );

  // Khronos PBR Neutral keeps metal and gem colours true to their presets (ACES pushes gold
  // toward orange and greys backdrops), but it is flatter; a small display-referred contrast
  // lift around mid-grey restores the punch of a product photograph.
  const CONTRAST = 1.1;
  const contrasted = vec4(toned.rgb.sub(0.5).mul(CONTRAST).add(0.5), toned.a);

  // Temporal AA already resolved edges upstream; otherwise SMAA. SMAA always writes alpha 1,
  // so the scene's coverage is carried past it for cutouts.
  const antialiased = temporal ? contrasted : (smaa(contrasted) as unknown as typeof contrasted);
  return vec4(antialiased.rgb, coverage);
}

/**
 * GTAO + optional macro depth of field + bloom + star glints + PBR Neutral tone mapping + SMAA
 * on WebGPURenderer's TSL RenderPipeline.
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

  if (config.enabled === false) {
    const composer = { render: () => renderer.render(scene, camera), dispose: () => {} };
    return { composer, dispose: composer.dispose };
  }

  const focusTracker = createFocusTracker(scene, camera);
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  pipeline.outputNode = buildOutputNode(scene, camera, config, focusTracker.focus);
  pipeline.needsUpdate = true;

  const composer: ViewerPostFXComposer = {
    render: () => {
      if (config.dof.enabled) focusTracker.update();
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
