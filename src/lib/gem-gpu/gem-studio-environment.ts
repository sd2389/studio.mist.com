import * as THREE from "three";

/**
 * Procedural jewelry light tents, generated as equirect HDRs.
 *
 * A diamond reads by contrast: some facets must mirror a bright source while their
 * neighbours mirror something dark, and fire only appears when a *small* bright source is
 * split into colours on exit. Photographers build exactly that — rings of softboxes with dark
 * gaps for catalogue shots, strip softboxes over a dark tent for dramatic ones, plus a few
 * pinpoint lights. Generic room HDRIs have none of it, which is why stones rendered in them
 * go grey. Building the tent in code keeps it sharp at any size and costs no download.
 *
 * Rows are written top-first with `flipY = true`, the same layout `HDRLoader` produces, so
 * the texture samples identically to a loaded `.hdr` (equirectUV convention).
 */

type Vec3 = [number, number, number];

/** Rectangular area in angular coordinates around `center`. */
type AngularRect = { center: Vec3; halfWidthDeg: number; halfHeightDeg: number; softDeg: number };
/** Adds light (softbox, strip). */
type Emitter = AngularRect & { kind: "box"; intensity: number };
type PointSource = { kind: "point"; center: Vec3; radiusDeg: number; intensity: number };
type TentElement = Emitter | PointSource;

type TentDesign = {
  /** Radiance of walls (y ≥ 0, by elevation) and floor (y < 0). */
  wall: (y: number) => number;
  elements: TentElement[];
};

export type GemStudioPreset = "white" | "studio" | "contrast" | "sparkle";

const DEG = Math.PI / 180;

function normalize([x, y, z]: Vec3): Vec3 {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function box(center: Vec3, halfWidthDeg: number, halfHeightDeg: number, intensity: number, softDeg = 1.5): Emitter {
  return { kind: "box", center: normalize(center), halfWidthDeg, halfHeightDeg, intensity, softDeg };
}

/** Pinpoint sources spread over the upper hemisphere; these are what fire is split from. */
function pinpoints(intensity: number, count = 10): PointSource[] {
  const dirs: Vec3[] = [
    [0.3, 0.9, 0.3], [-0.35, 0.85, 0.4], [0.55, 0.7, -0.2], [-0.6, 0.65, -0.1],
    [0.1, 0.6, 0.8], [-0.15, 0.95, -0.25], [0.75, 0.55, 0.35], [-0.8, 0.5, 0.3],
    [0.2, 0.45, -0.85], [-0.3, 0.4, 0.9],
  ];
  return dirs.slice(0, count).map((c) => ({ kind: "point", center: normalize(c), radiusDeg: 0.7, intensity }));
}

/** Front-left / front-right vertical strips; the default camera sits in front (+Z), slightly right and above. */
function frontStrips(intensity: number): Emitter[] {
  return [box([-0.85, 0.32, 0.45], 6, 34, intensity), box([0.88, 0.28, 0.42], 6, 34, intensity)];
}

type PanelRing = {
  count: number;
  elevationDeg: number;
  halfWidthDeg: number;
  halfHeightDeg: number;
  intensity: number;
  softDeg: number;
  /** Azimuth offset as a fraction of the spacing, to stagger rings against each other. */
  offset?: number;
};

/** Softboxes evenly spaced in azimuth at one elevation, dark gaps between them. */
function panelRing({ count, elevationDeg, halfWidthDeg, halfHeightDeg, intensity, softDeg, offset = 0.5 }: PanelRing): Emitter[] {
  const elevation = elevationDeg * DEG;
  return Array.from({ length: count }, (_, i) => {
    const azimuth = ((i + offset) / count) * Math.PI * 2;
    const center: Vec3 = [Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation)];
    return box(center, halfWidthDeg, halfHeightDeg, intensity, softDeg);
  });
}

/**
 * Walls and ceiling from `horizon` to `zenith`, over a darker floor, blended across a few
 * degrees at the horizon so the floor line mirrors as a clean edge rather than a stair-step.
 */
function dome(floor: number, horizon: number, zenith: number): (y: number) => number {
  return (y) => floor + (horizon + (zenith - horizon) * Math.max(y, 0) - floor) * smoothstep(-0.03, 0.12, y);
}

/*
 * Light reaching the eye has crossed the stone's surface twice, keeping ~65% of the source,
 * and the viewer applies ~0.86 exposure, so panels at ~2 land on white. What the stone looks
 * like is then set by how much of the sky is panel: all of it reads as a flat white glare,
 * a little of it as a black stone, and roughly half — in panels a facet can resolve, staggered
 * so neighbouring facets catch different ones — as the crisp bright mosaic of a real diamond.
 * Face-up, most returning light comes from 40–75° above the girdle plane, so that band
 * carries the most structure.
 */
const TENTS: Record<GemStudioPreset, TentDesign> = {
  // Catalogue light box: an overhead softbox, two staggered rings of panels on a dark tent
  // (~55% of the sky lit), pinpoints for fire, over a white sweep — side views send much
  // of their light down, and a black floor would turn a ring's stone black.
  white: {
    wall: dome(0.45, 0.05, 0.06),
    elements: [
      box([0, 1, 0.08], 22, 22, 2.4, 3),
      ...panelRing({ count: 8, elevationDeg: 52, halfWidthDeg: 10, halfHeightDeg: 12, intensity: 2, softDeg: 2 }),
      ...panelRing({ count: 8, elevationDeg: 20, halfWidthDeg: 14, halfHeightDeg: 14, intensity: 2, softDeg: 2, offset: 0 }),
      ...pinpoints(90),
    ],
  },
  // Larger, softer-edged panels over a lifted tent: gentler facet contrast for soft lighting.
  studio: {
    wall: dome(0.5, 0.3, 0.35),
    elements: [
      box([0, 1, 0.08], 26, 26, 1.8, 8),
      ...panelRing({ count: 6, elevationDeg: 45, halfWidthDeg: 18, halfHeightDeg: 18, intensity: 1.6, softDeg: 8 }),
      ...pinpoints(60),
    ],
  },
  // Dark tent ringed with strip softboxes: a bolder light/dark mosaic for dark backdrops.
  contrast: {
    wall: dome(0.12, 0.04, 0.06),
    elements: [
      box([0, 1, 0.08], 20, 20, 2.6, 4),
      ...panelRing({ count: 10, elevationDeg: 28, halfWidthDeg: 7, halfHeightDeg: 28, intensity: 3.2, softDeg: 2 }),
      ...pinpoints(70),
    ],
  },
  // Dark tent with a broad overhead softbox and dense pinpoints: fire-forward drama.
  sparkle: {
    wall: dome(0.12, 0.04, 0.06),
    elements: [
      box([0, 1, 0.08], 28, 28, 2.4, 6),
      ...panelRing({ count: 6, elevationDeg: 28, halfWidthDeg: 5, halfHeightDeg: 28, intensity: 3, softDeg: 2 }),
      ...frontStrips(4),
      ...pinpoints(90),
    ],
  },
};

/** Local frame of a rectangular element, for its angular coordinates. */
type ElementFrame = { right: Vec3; up: Vec3 };

function boundingAngleDeg(element: TentElement): number {
  if (element.kind === "point") return element.radiusDeg;
  return Math.hypot(element.halfWidthDeg + element.softDeg, element.halfHeightDeg + element.softDeg);
}

function frameFor(element: TentElement): ElementFrame {
  const center = element.center;
  const worldUp: Vec3 = Math.abs(center[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0];
  const right = normalize(cross(worldUp, center));
  return { right, up: cross(center, right) };
}

/** 0..1 coverage of `dir` by an angular rectangle, with a diffuser-style hot centre in `.falloff`. */
function rectCoverage(rect: AngularRect, dir: Vec3, frame: ElementFrame): { coverage: number; falloff: number } {
  const along = dot(dir, rect.center);
  if (along <= 0) return { coverage: 0, falloff: 0 };
  const ax = Math.abs(Math.atan2(dot(dir, frame.right), along)) / DEG;
  const ay = Math.abs(Math.atan2(dot(dir, frame.up), along)) / DEG;
  const coverage =
    smoothstep(rect.halfWidthDeg + rect.softDeg, rect.halfWidthDeg - rect.softDeg, ax) *
    smoothstep(rect.halfHeightDeg + rect.softDeg, rect.halfHeightDeg - rect.softDeg, ay);
  return { coverage, falloff: 0.8 + 0.2 * (1 - Math.min((ax / rect.halfWidthDeg) ** 2, 1)) };
}

function pointRadiance(point: PointSource, dir: Vec3): number {
  const along = dot(dir, point.center);
  if (along <= 0) return 0;
  const angle = Math.acos(Math.min(along, 1)) / DEG;
  return point.intensity * smoothstep(point.radiusDeg, point.radiusDeg * 0.45, angle);
}

type TentGrid = {
  width: number;
  height: number;
  /** Per-row elevation sine/cosine and per-column azimuth cosine/sine (equirectUV convention). */
  rowSin: Float64Array;
  rowCos: Float64Array;
  colCos: Float64Array;
  colSin: Float64Array;
};

function createGrid(width: number, height: number): TentGrid {
  const grid: TentGrid = {
    width,
    height,
    rowSin: new Float64Array(height),
    rowCos: new Float64Array(height),
    colCos: new Float64Array(width),
    colSin: new Float64Array(width),
  };
  for (let row = 0; row < height; row++) {
    const theta = Math.PI / 2 - ((row + 0.5) / height) * Math.PI;
    grid.rowSin[row] = Math.sin(theta);
    grid.rowCos[row] = Math.cos(theta);
  }
  for (let col = 0; col < width; col++) {
    const phi = ((col + 0.5) / width - 0.5) * Math.PI * 2;
    grid.colCos[col] = Math.cos(phi);
    grid.colSin[col] = Math.sin(phi);
  }
  return grid;
}

/**
 * Visit only the texels inside an element's bounding cone. Elements cover a small part of
 * the sphere, so splatting each one is far cheaper than testing every element per texel.
 */
function forEachTexelNear(grid: TentGrid, element: TentElement, visit: (index: number, dir: Vec3) => void): void {
  const [cx, cy, cz] = element.center;
  const radius = Math.min(boundingAngleDeg(element) * DEG * 1.05, Math.PI / 2);
  const elevation = Math.asin(Math.max(-1, Math.min(1, cy)));
  const rowOf = (theta: number) => Math.floor(((Math.PI / 2 - theta) / Math.PI) * grid.height);
  const firstRow = Math.max(0, rowOf(Math.min(elevation + radius, Math.PI / 2)));
  const lastRow = Math.min(grid.height - 1, rowOf(Math.max(elevation - radius, -Math.PI / 2)));
  const minAlong = Math.cos(radius);
  const dir: Vec3 = [0, 0, 0];
  for (let row = firstRow; row <= lastRow; row++) {
    const cosT = grid.rowCos[row]!;
    const y = grid.rowSin[row]!;
    for (let col = 0; col < grid.width; col++) {
      dir[0] = grid.colCos[col]! * cosT;
      dir[1] = y;
      dir[2] = grid.colSin[col]! * cosT;
      if (dir[0] * cx + dir[1] * cy + dir[2] * cz < minAlong) continue;
      visit(row * grid.width + col, dir);
    }
  }
}

function renderTent(design: TentDesign, grid: TentGrid): Float32Array {
  const radiance = new Float32Array(grid.width * grid.height);
  for (let row = 0; row < grid.height; row++) {
    radiance.fill(design.wall(grid.rowSin[row]!), row * grid.width, (row + 1) * grid.width);
  }
  for (const element of design.elements) {
    const frame = frameFor(element);
    forEachTexelNear(grid, element, (index, dir) => {
      if (element.kind === "point") {
        radiance[index]! += pointRadiance(element, dir);
      } else {
        const { coverage, falloff } = rectCoverage(element, dir, frame);
        radiance[index]! += element.intensity * coverage * falloff;
      }
    });
  }
  return radiance;
}

/** 2048 wide ≈ 0.18° per texel: reflected stripe and softbox edges stay sharp in every facet. */
export function createGemStudioEnvironment(preset: GemStudioPreset = "white", width = 2048): THREE.DataTexture {
  const height = width / 2;
  const radiance = renderTent(TENTS[preset], createGrid(width, height));
  const data = new Uint16Array(width * height * 4);
  const one = THREE.DataUtils.toHalfFloat(1);
  for (let i = 0; i < radiance.length; i++) {
    const half = THREE.DataUtils.toHalfFloat(radiance[i]!);
    data[i * 4] = half;
    data[i * 4 + 1] = half;
    data[i * 4 + 2] = half;
    data[i * 4 + 3] = one;
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.name = `gem-studio-${preset}`;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.flipY = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const cache = new Map<GemStudioPreset, THREE.DataTexture>();

/** Shared, lazily generated tent — the default environment for every traced gem. */
export function getGemStudioEnvironment(preset: GemStudioPreset = "white"): THREE.DataTexture {
  let tex = cache.get(preset);
  if (!tex) {
    tex = createGemStudioEnvironment(preset);
    cache.set(preset, tex);
  }
  return tex;
}
