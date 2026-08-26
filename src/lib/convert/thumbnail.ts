import * as THREE from "three";
import { createViewerRenderer } from "@/lib/gpu/viewer-renderer";
import { fitModelToUnit } from "./stamp-slots";

const THUMB_SIZE = 512;

function canvasToWebpBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("thumbnail toBlob failed"))),
      "image/webp",
      0.82,
    );
  });
}

export async function generateModelThumbnail(root: THREE.Object3D): Promise<Blob> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4f1ea);

  const model = root.clone(true);
  fitModelToUnit(model, 1.4);
  scene.add(model);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2.5, 4, 3);
  const fill = new THREE.DirectionalLight(0xdde8ff, 0.45);
  fill.position.set(-3, 1, -2);
  scene.add(ambient, key, fill);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(0, 0.35, 2.8);
  camera.lookAt(0, 0, 0);

  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(THUMB_SIZE, THUMB_SIZE)
      : (() => {
          const el = document.createElement("canvas");
          el.width = THUMB_SIZE;
          el.height = THUMB_SIZE;
          return el;
        })();

  const renderer = await createViewerRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  try {
    renderer.render(scene, camera);
    return await canvasToWebpBlob(canvas);
  } finally {
    renderer.dispose();
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
  }
}
