import * as THREE from "three";
import { createViewerRenderer, type ViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { applyViewerColorManagement } from "@/lib/render-color-management";
import {
  DEFAULT_VIEWER_POSTFX,
  type ViewerPostFXConfig,
} from "@/lib/viewer-postfx-config";
import {
  createViewerPostFXComposer,
  renderWithPostFX,
} from "@/lib/viewer-postfx-pipeline";

export type ImageExportFormat = "png" | "jpeg";

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
};

function makeCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function toBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: mimeType, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      mimeType,
      quality,
    );
  });
}

export async function renderAtResolution(opts: RenderOpts): Promise<Blob> {
  const {
    gl,
    scene,
    camera,
    width,
    height,
    transparent = false,
    pixelRatio = 1,
    exposure = gl.toneMappingExposure ?? 1,
    postfxConfig = DEFAULT_VIEWER_POSTFX,
    format = "png",
    jpegQuality = 0.92,
  } = opts;

  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const blobQuality = format === "jpeg" ? jpegQuality : undefined;

  const canvas = makeCanvas(width, height);
  const renderer = await createViewerRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  applyViewerColorManagement(renderer, exposure);

  // Export owns its camera and scene container. The live viewport can keep
  // rendering while PNG/JPEG encoding is asynchronous.
  const exportScene = scene.clone(true);
  const exportCamera = camera.clone();
  if (exportCamera instanceof THREE.PerspectiveCamera) {
    exportCamera.aspect = width / height;
    exportCamera.updateProjectionMatrix();
  }
  if (transparent) {
    renderer.setClearColor(0x000000, 0);
    exportScene.background = null;
  }

  let disposePipeline: (() => void) | undefined;
  try {
    const { composer, dispose } = createViewerPostFXComposer(
      renderer, exportScene, exportCamera, width, height, postfxConfig, exposure,
    );
    disposePipeline = dispose;
    renderWithPostFX(composer);
    return await toBlob(canvas, mimeType, blobQuality);
  } finally {
    disposePipeline?.();
    renderer.dispose();
  }
}
