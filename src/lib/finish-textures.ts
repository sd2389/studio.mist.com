import * as THREE from "three";
import type { FinishId } from "@/stores/material-preset-store";

/**
 * Per-finish procedural texture maps. Generated once in browser memory using
 * the Canvas 2D API, then cached. The texture set ships as:
 *   - roughnessMap (grayscale variation around the spec's base roughness)
 *   - normalMap (derived bump → tangent-space normal)
 *
 * No external asset downloads; mirrors what Substance Source's procedural
 * metal patterns generate, scaled to a 512² texture which is plenty for
 * jewelry-sized surfaces.
 */
export type FinishMaps = {
  roughnessMap: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  /** UV-space repeat for the maps. Higher = finer pattern. */
  repeat: number;
  /** Normal map strength fed to MeshPhysicalMaterial.normalScale. */
  normalScale: number;
  /** Multiplier on the base material roughness. <1 stays polished. */
  roughnessFactor: number;
};

const TEX_SIZE = 512;
const cache = new Map<FinishId, FinishMaps>();

export function getFinishMaps(finish: FinishId): FinishMaps {
  if (typeof document === "undefined") {
    return { roughnessMap: null, normalMap: null, repeat: 4, normalScale: 0, roughnessFactor: 1 };
  }
  const cached = cache.get(finish);
  if (cached) return cached;

  const built = buildFinish(finish);
  cache.set(finish, built);
  return built;
}

function buildFinish(finish: FinishId): FinishMaps {
  switch (finish) {
    case "polished":
      return { roughnessMap: null, normalMap: null, repeat: 1, normalScale: 0, roughnessFactor: 1 };

    case "brushed": {
      // Directional anisotropic streaks along U.
      const heightCanvas = drawHeight((ctx) => {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        for (let y = 0; y < TEX_SIZE; y++) {
          for (let x = 0; x < TEX_SIZE; x += 1) {
            const v = 128 + Math.round((Math.random() - 0.5) * 64);
            ctx.fillStyle = `rgb(${v},${v},${v})`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
        // Horizontal blur (3-pixel box) to make it streak in X.
        const img = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
        for (let y = 0; y < TEX_SIZE; y++) {
          for (let x = 1; x < TEX_SIZE - 1; x++) {
            const i = (y * TEX_SIZE + x) * 4;
            img.data[i] = (img.data[i - 4] + img.data[i] + img.data[i + 4]) / 3;
            img.data[i + 1] = img.data[i];
            img.data[i + 2] = img.data[i];
          }
        }
        ctx.putImageData(img, 0, 0);
      });
      return finalize(heightCanvas, { repeat: 6, normalScale: 0.35, roughnessFactor: 1.6 });
    }

    case "satin": {
      // Soft fine noise — like 600-grit matte.
      const heightCanvas = drawHeight((ctx) => {
        const img = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = 110 + Math.random() * 30;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      });
      return finalize(heightCanvas, { repeat: 8, normalScale: 0.18, roughnessFactor: 1.3 });
    }

    case "hammered": {
      // Domed dimples — circles with Gaussian-ish falloff.
      const heightCanvas = drawHeight((ctx) => {
        ctx.fillStyle = "#7f7f7f";
        ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
        const count = 90;
        for (let i = 0; i < count; i++) {
          const cx = Math.random() * TEX_SIZE;
          const cy = Math.random() * TEX_SIZE;
          const r = 24 + Math.random() * 36;
          const peak = Math.random() < 0.5 ? 200 : 60;
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          grad.addColorStop(0, `rgba(${peak},${peak},${peak},1)`);
          grad.addColorStop(1, "rgba(127,127,127,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
      });
      return finalize(heightCanvas, { repeat: 3, normalScale: 0.85, roughnessFactor: 1.45 });
    }

    case "sandblasted": {
      // Dense fine noise — matte microscratched.
      const heightCanvas = drawHeight((ctx) => {
        const img = ctx.createImageData(TEX_SIZE, TEX_SIZE);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = 70 + Math.random() * 110;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
      });
      return finalize(heightCanvas, { repeat: 12, normalScale: 0.55, roughnessFactor: 2.4 });
    }
  }
}

function drawHeight(paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TEX_SIZE;
  c.height = TEX_SIZE;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D ctx unavailable");
  paint(ctx);
  return c;
}

function finalize(
  heightCanvas: HTMLCanvasElement,
  cfg: { repeat: number; normalScale: number; roughnessFactor: number },
): FinishMaps {
  const rough = new THREE.CanvasTexture(heightCanvas);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  rough.repeat.set(cfg.repeat, cfg.repeat);
  rough.colorSpace = THREE.NoColorSpace;
  rough.anisotropy = 4;

  const normal = canvasToNormalMap(heightCanvas);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(cfg.repeat, cfg.repeat);
  normal.colorSpace = THREE.NoColorSpace;
  normal.anisotropy = 4;

  return {
    roughnessMap: rough,
    normalMap: normal,
    repeat: cfg.repeat,
    normalScale: cfg.normalScale,
    roughnessFactor: cfg.roughnessFactor,
  };
}

/** Sobel-based grayscale → tangent-space normal map. Cheap, runs once per finish. */
function canvasToNormalMap(height: HTMLCanvasElement): THREE.Texture {
  const w = height.width;
  const h = height.height;
  const src = height.getContext("2d")!.getImageData(0, 0, w, h).data;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  const img = ctx.createImageData(w, h);

  const sample = (x: number, y: number) => {
    const ix = ((x + w) % w) + ((y + h) % h) * w;
    return src[ix * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);
      const dX = tr + 2 * r + br - tl - 2 * l - bl;
      const dY = bl + 2 * b + br - tl - 2 * t - tr;
      const nx = dX;
      const ny = dY;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(out);
}
