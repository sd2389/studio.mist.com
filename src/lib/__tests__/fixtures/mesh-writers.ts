import * as THREE from "three";

/** Serialise test geometry into the file formats jewelers export, for loader round-trips. */

function trianglesOf(geometry: THREE.BufferGeometry): number[][] {
  const position = geometry.getAttribute("position");
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const corners: number[][] = [];
  for (let c = 0; c < count; c++) {
    const v = index ? index.getX(c) : c;
    corners.push([position.getX(v), position.getY(v), position.getZ(v)]);
  }
  return corners;
}

export function toBinaryStl(geometry: THREE.BufferGeometry): ArrayBuffer {
  const corners = trianglesOf(geometry);
  const triangleCount = corners.length / 3;
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangleCount, true);
  for (let t = 0; t < triangleCount; t++) {
    const offset = 84 + t * 50;
    // Leave the facet normal zero, as many CAD exporters do; loaders recompute it.
    for (let k = 0; k < 3; k++) {
      const [x, y, z] = corners[t * 3 + k];
      view.setFloat32(offset + 12 + k * 12, x, true);
      view.setFloat32(offset + 16 + k * 12, y, true);
      view.setFloat32(offset + 20 + k * 12, z, true);
    }
  }
  return buffer;
}

type ObjPart = { geometry: THREE.BufferGeometry; object?: string; material?: string };

/** Indexed OBJ (shared `v` lines per part, no `vn`), optionally named per part. */
export function toObjText(parts: ObjPart[], mtllib?: string): string {
  const lines: string[] = mtllib ? [`mtllib ${mtllib}`] : [];
  let base = 1;
  for (const { geometry, object, material } of parts) {
    const position = geometry.getAttribute("position");
    if (object) lines.push(`o ${object}`);
    if (material) lines.push(`usemtl ${material}`);
    for (let v = 0; v < position.count; v++) {
      lines.push(`v ${position.getX(v)} ${position.getY(v)} ${position.getZ(v)}`);
    }
    const index = geometry.index;
    const count = index ? index.count : position.count;
    for (let c = 0; c < count; c += 3) {
      const at = (k: number) => (index ? index.getX(c + k) : c + k) + base;
      lines.push(`f ${at(0)} ${at(1)} ${at(2)}`);
    }
    base += position.count;
  }
  return lines.join("\n");
}

export function toAsciiPly(geometry: THREE.BufferGeometry): string {
  const corners = trianglesOf(geometry);
  const faces = corners.length / 3;
  const header = [
    "ply",
    "format ascii 1.0",
    `element vertex ${corners.length}`,
    "property float x",
    "property float y",
    "property float z",
    `element face ${faces}`,
    "property list uchar int vertex_indices",
    "end_header",
  ];
  const body = corners.map(([x, y, z]) => `${x} ${y} ${z}`);
  for (let f = 0; f < faces; f++) body.push(`3 ${f * 3} ${f * 3 + 1} ${f * 3 + 2}`);
  return [...header, ...body].join("\n");
}
