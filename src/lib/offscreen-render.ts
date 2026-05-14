import * as THREE from "three";

type RenderOpts = {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  width: number;
  height: number;
  transparent?: boolean;
  pixelRatio?: number;
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

function toBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/png" });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/png",
    );
  });
}

export async function renderAtResolution(opts: RenderOpts): Promise<Blob> {
  const { gl, scene, camera, width, height, transparent = false, pixelRatio = 1 } = opts;

  const canvas = makeCanvas(width, height);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = gl.outputColorSpace;
  renderer.toneMapping = gl.toneMapping;
  renderer.toneMappingExposure = gl.toneMappingExposure;

  let prevAspect: number | null = null;
  if (camera instanceof THREE.PerspectiveCamera) {
    prevAspect = camera.aspect;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const prevBg = scene.background;
  if (transparent) {
    renderer.setClearColor(0x000000, 0);
    scene.background = null;
  }

  try {
    renderer.render(scene, camera);
    const blob = await toBlob(canvas);
    return blob;
  } finally {
    if (transparent) {
      scene.background = prevBg;
    }
    if (prevAspect !== null && camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = prevAspect;
      camera.updateProjectionMatrix();
    }
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
