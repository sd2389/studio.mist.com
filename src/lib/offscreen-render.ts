import * as THREE from "three";
import { GEM_TRACE_BOUNCES, withGemTraceBounces } from "@/lib/gem-gpu/gem-trace-material";
import { createSampleAverager, jitterOffset, STILL_EXPORT_SAMPLES } from "@/lib/export-supersample";
import { createViewerRenderer, type ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { setJewelryGemTime } from "@/lib/gem-gpu/jewelry-gem-shader";
import { loadBackdropImage, WHITE_BACKDROP, type ExportBackdrop } from "@/lib/export-backdrop";
import {
  canvasToBlob,
  createExportLayers,
  makeCanvas,
  type ExportCanvas,
} from "@/lib/export-compositing";
import { applyViewerColorManagement } from "@/lib/render-color-management";
import {
  DEFAULT_VIEWER_POSTFX,
  type ViewerPostFXConfig,
} from "@/lib/viewer-postfx-config";
import {
  createViewerPostFXComposer,
  renderWithPostFX,
  type ViewerPostFXHandle,
} from "@/lib/viewer-postfx-pipeline";

export type { ExportCanvas };
export type ImageExportFormat = "png" | "jpeg";

export const DEFAULT_JPEG_QUALITY = 0.95;

type RenderOpts = {
  gl: ViewerRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  width: number;
  height: number;
  transparent?: boolean;
  pixelRatio?: number;
  exposure?: number;
  postfxConfig?: ViewerPostFXConfig;
  format?: ImageExportFormat;
  jpegQuality?: number;
  /**
   * Painted behind the render when it is flattened. JPEG always gets one (white when
   * omitted); an opaque PNG gets it only when given (CSS gradient/image backgrounds).
   */
  backdrop?: ExportBackdrop | null;
  /** Adjusts the private scene clone before rendering (e.g. hide the studio set for cutouts). */
  prepareScene?: (scene: THREE.Scene) => void;
};

export type OffscreenSessionOpts = {
  gl: ViewerRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  width: number;
  height: number;
  pixelRatio?: number;
  exposure?: number;
  postfxConfig?: ViewerPostFXConfig;
  prepareScene?: (scene: THREE.Scene) => void;
};

export type CaptureOpts = {
  /** Drives time-based gem uniforms so frame N is a function of N, not the wall clock. */
  timeSec?: number;
  /** Flatten onto this (JPEG, video, spin frames). */
  backdrop?: ExportBackdrop | null;
  backdropImage?: CanvasImageSource | null;
  /** Build the transparent layer (costs a CPU pass; skip for video frames). Default true. */
  cutout?: boolean;
  /** Jittered renders averaged per image (stills); 1 for video and spin frames. */
  samples?: number;
};

export type Capture = {
  /** Transparent render with correct alpha (2D layer, stable until the next capture). */
  cutout: ExportCanvas | null;
  /** Opaque render flattened over the backdrop, or null when none was requested. */
  flat: ExportCanvas | null;
};

/**
 * One offscreen renderer + PostFX pipeline reused for many frames and sizes. It renders a
 * private clone of the scene (materials and geometry stay shared — never deep-cloned) and a
 * private camera, so the live viewport is never moved or resized.
 */
export type OffscreenRenderSession = {
  readonly canvas: ExportCanvas;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly width: number;
  readonly height: number;
  /** The scene paints its own background (solid colour / texture), so renders are opaque. */
  readonly hasOpaqueBackground: boolean;
  setSize(width: number, height: number): void;
  /** Exactly the viewport look, scene background included. Read the canvas before awaiting. */
  render(opts?: { timeSec?: number; samples?: number }): ExportCanvas;
  /** Alpha-correct cutout, plus the frame flattened over a backdrop when one is given. */
  capture(opts?: CaptureOpts): Capture;
  dispose(): void;
};

function collectPhysicalMaterials(root: THREE.Object3D): Set<THREE.MeshPhysicalMaterial> {
  const found = new Set<THREE.MeshPhysicalMaterial>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshPhysicalMaterial) found.add(material);
    }
  });
  return found;
}

type NodeFrameLike = { time: number; lastTime?: number };

/** TSL `time` (e.g. water-floor ripples) advances with the wall clock on every render. */
function nodeFrameOf(renderer: ViewerRenderer): NodeFrameLike | null {
  const frame = (renderer as unknown as { _nodes?: { nodeFrame?: NodeFrameLike } })._nodes?.nodeFrame;
  return frame && typeof frame.time === "number" ? frame : null;
}

/**
 * The live loop animates gem uniforms (sparkle time, dispersion shimmer) from the wall
 * clock on materials this session shares, and TSL `time` follows the wall clock too. Pin
 * both right before every render so frame N is a function of N.
 */
function createCaptureClock(root: THREE.Object3D, renderer: ViewerRenderer) {
  const pinned = new Map<THREE.MeshPhysicalMaterial, number>();
  const frame = nodeFrameOf(renderer);
  return (timeSec: number) => {
    for (const material of collectPhysicalMaterials(root)) {
      if (!pinned.has(material)) pinned.set(material, material.dispersion);
      material.dispersion = pinned.get(material)!;
      setJewelryGemTime(material, timeSec);
    }
    if (frame) {
      frame.time = timeSec;
      frame.lastTime = performance.now();
    }
  };
}

/** Export shadow maps: the viewport's 1024² map shows texel steps at 2000²+ output. */
const EXPORT_SHADOW_MAP_SIZE = 4096;

/** Raise shadow-map resolution on the clone's lights (clones own their LightShadow). */
function sharpenShadowMaps(root: THREE.Object3D, size: number): void {
  root.traverse((object) => {
    const light = object as THREE.Object3D & { isLight?: boolean; castShadow: boolean; shadow?: THREE.LightShadow };
    if (!light.isLight || !light.castShadow || !light.shadow) return;
    const { mapSize } = light.shadow;
    if (mapSize.x >= size && mapSize.y >= size) return;
    mapSize.set(Math.max(mapSize.x, size), Math.max(mapSize.y, size));
    light.shadow.map?.dispose();
    light.shadow.map = null;
  });
}

/**
 * The viewport PostFX chain (bloom added as vec4, SMAA) writes alpha ≈ 1 everywhere, so
 * coverage comes from a plain render of the same frame; colour still comes from PostFX.
 */
function matteConfig(config: ViewerPostFXConfig): ViewerPostFXConfig {
  return { ...config, enabled: false };
}

export async function createOffscreenRenderSession(
  opts: OffscreenSessionOpts,
): Promise<OffscreenRenderSession> {
  const {
    gl,
    scene,
    camera,
    pixelRatio = 1,
    exposure = gl.toneMappingExposure ?? 1,
    postfxConfig = DEFAULT_VIEWER_POSTFX,
  } = opts;
  let width = Math.max(1, Math.round(opts.width));
  let height = Math.max(1, Math.round(opts.height));

  const canvas = makeCanvas(width, height);
  const renderer = await createViewerRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  applyViewerColorManagement(renderer, exposure);
  // Parity with the viewport: contact shadows need the shadow map the live renderer uses.
  renderer.shadowMap.enabled = gl.shadowMap?.enabled ?? false;
  renderer.shadowMap.type = gl.shadowMap?.type ?? THREE.PCFShadowMap;
  // Alpha 0 wherever nothing is drawn; flattening paints a backdrop (never black).
  renderer.setClearColor(0x000000, 0);

  const exportScene = scene.clone(true);
  opts.prepareScene?.(exportScene);
  sharpenShadowMaps(exportScene, EXPORT_SHADOW_MAP_SIZE);
  const exportCamera = camera.clone();
  const sceneBackground = exportScene.background;
  const applyClock = createCaptureClock(exportScene, renderer);
  const layers = createExportLayers();
  const build = (config: ViewerPostFXConfig): ViewerPostFXHandle =>
    createViewerPostFXComposer(renderer, exportScene, exportCamera, width, height, config, exposure);
  const main = build(postfxConfig);
  const matte = postfxConfig.enabled === false ? null : build(matteConfig(postfxConfig));

  const updateAspect = () => {
    if (exportCamera instanceof THREE.PerspectiveCamera) {
      exportCamera.aspect = width / height;
      exportCamera.updateProjectionMatrix();
    }
  };
  updateAspect();

  /** Run `renderSample` once per sub-pixel jitter offset, then restore the unjittered camera. */
  const withJitter = (samples: number, renderSample: () => void) => {
    const perspective = exportCamera instanceof THREE.PerspectiveCamera ? exportCamera : null;
    try {
      for (let i = 0; i < samples; i++) {
        const [dx, dy] = jitterOffset(i);
        perspective?.setViewOffset(width, height, dx, dy, width, height);
        renderSample();
      }
    } finally {
      perspective?.clearViewOffset();
    }
  };

  const draw = (handle: ViewerPostFXHandle, background: THREE.Scene["background"], timeSec: number) => {
    exportScene.background = background;
    applyClock(timeSec);
    // Finals always trace stones at full depth, whatever quality tier the viewport runs.
    withGemTraceBounces(exportScene, GEM_TRACE_BOUNCES.photometric, () => renderWithPostFX(handle.composer));
  };

  return {
    canvas,
    scene: exportScene,
    camera: exportCamera,
    hasOpaqueBackground: sceneBackground !== null,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    setSize(nextWidth, nextHeight) {
      const w = Math.max(1, Math.round(nextWidth));
      const h = Math.max(1, Math.round(nextHeight));
      if (w === width && h === height) return;
      width = w;
      height = h;
      renderer.setSize(width, height, false);
      updateAspect();
    },
    render({ timeSec = 0, samples = 1 } = {}) {
      if (samples <= 1) {
        draw(main, sceneBackground, timeSec);
        return canvas;
      }
      const average = createSampleAverager();
      withJitter(samples, () => {
        draw(main, sceneBackground, timeSec);
        average.add(canvas);
      });
      return average.resolve();
    },
    capture({ timeSec = 0, backdrop = null, backdropImage = null, cutout = true, samples = 1 } = {}) {
      const captureOnce = (): Capture => {
        draw(matte ?? main, null, timeSec);
        const matteLayer = layers.copyMatte(canvas);
        if (matte) draw(main, null, timeSec);
        return {
          cutout: cutout ? layers.cutout(matteLayer, canvas) : null,
          flat: backdrop ? layers.flatten(backdrop, backdropImage, matteLayer, canvas) : null,
        };
      };
      if (samples <= 1) return captureOnce();
      const cutouts = cutout ? createSampleAverager() : null;
      const flats = backdrop ? createSampleAverager() : null;
      withJitter(samples, () => {
        const shot = captureOnce();
        if (shot.cutout) cutouts?.add(shot.cutout);
        if (shot.flat) flats?.add(shot.flat);
      });
      return { cutout: cutouts?.resolve() ?? null, flat: flats?.resolve() ?? null };
    },
    dispose() {
      matte?.dispose();
      main.dispose();
      renderer.dispose();
    },
  };
}

export function encodeCanvas(
  canvas: ExportCanvas,
  format: ImageExportFormat,
  jpegQuality = DEFAULT_JPEG_QUALITY,
): Promise<Blob> {
  return format === "jpeg"
    ? canvasToBlob(canvas, "image/jpeg", jpegQuality)
    : canvasToBlob(canvas, "image/png");
}

/** One-shot still: same PostFX pipeline as the viewport (AO, bloom, tone mapping, SMAA). */
export async function renderAtResolution(opts: RenderOpts): Promise<Blob> {
  const { transparent = false, format = "png", backdrop = null } = opts;
  const session = await createOffscreenRenderSession(opts);
  try {
    if (!transparent && session.hasOpaqueBackground) {
      return await encodeCanvas(session.render(), format, opts.jpegQuality);
    }
    const flattenOnto = format === "jpeg" ? backdrop ?? WHITE_BACKDROP : transparent ? null : backdrop;
    const backdropImage = await loadBackdropImage(flattenOnto);
    const { cutout, flat } = session.capture({
      backdrop: flattenOnto,
      backdropImage,
      cutout: !flattenOnto,
      samples: STILL_EXPORT_SAMPLES,
    });
    return await encodeCanvas((flat ?? cutout)!, format, opts.jpegQuality);
  } finally {
    session.dispose();
  }
}
