#!/usr/bin/env node
/*
 * Writes the convert mode's fixtures, which its unit tests (src/features/render/harness/
 * convert-design.test.ts) and `npm run worker:smoke-convert` convert: one small ring, a faceted
 * band and a single-cut stone on top, in millimetres, as each format a bulk upload takes:
 *
 * - ring.step: two closed B-rep solids of planar faces, products "Band" and "Stone" (AP214);
 * - ring.3dm: two meshes on the layers "Metal" and "Gem", the file in millimetres (Rhino 8);
 * - ring.obj + ring.mtl: the two as OBJ objects with materials "Gold" and "Diamond";
 * - ring-cm.stl: the two as one binary STL in centimetres, which only `units: "cm"` sizes right.
 *
 * Deterministic: run it again and the files come out the same, byte for byte, but for the 3DM,
 * which carries a creation time and object ids. Usage: node tests/convert/make-fixtures.mjs
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// The ring: polyhedra whose faces are planar and wound counter-clockwise seen from outside
// ---------------------------------------------------------------------------

/** A faceted torus round the z axis: every quad of a torus's grid is a planar trapezoid. */
function band({ radius = 9, tube = 1.1, around = 24, across = 8 } = {}) {
  const vertices = [];
  for (let i = 0; i < around; i += 1) {
    const u = (i / around) * Math.PI * 2;
    for (let j = 0; j < across; j += 1) {
      const v = (j / across) * Math.PI * 2;
      const ring = radius + tube * Math.cos(v);
      vertices.push([ring * Math.cos(u), ring * Math.sin(u), tube * Math.sin(v)]);
    }
  }
  const at = (i, j) => (i % around) * across + (j % across);
  const faces = [];
  for (let i = 0; i < around; i += 1) {
    for (let j = 0; j < across; j += 1) faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
  }
  return { name: "Band", vertices, faces };
}

/** A round single cut, its table up the y axis: an octagonal table, 8 crown, 8 girdle and 8 pavilion facets. */
function stone({ diameter = 6.5, segments = 8, y = 13.3 } = {}) {
  const radius = diameter / 2;
  const levels = [
    [radius * 0.56, diameter * 0.015 + diameter * 0.15],
    [radius, diameter * 0.015],
    [radius, -diameter * 0.015],
  ];
  const vertices = levels.flatMap(([r, height]) =>
    Array.from({ length: segments }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      return [r * Math.cos(a), y + height, r * Math.sin(a)];
    }),
  );
  const culet = vertices.push([0, y - diameter * 0.015 - diameter * 0.43, 0]) - 1;
  const [table, girdleTop, girdleBottom] = [0, segments, 2 * segments];
  const next = (i) => (i + 1) % segments;
  // The ring's corners go clockwise seen from above, so the table lists them backwards.
  const faces = [Array.from({ length: segments }, (_, i) => table + (segments - i) % segments)];
  for (let i = 0; i < segments; i += 1) {
    faces.push([table + i, table + next(i), girdleTop + next(i), girdleTop + i]);
    faces.push([girdleTop + i, girdleTop + next(i), girdleBottom + next(i), girdleBottom + i]);
    faces.push([girdleBottom + i, girdleBottom + next(i), culet]);
  }
  return { name: "Stone", vertices, faces };
}

/** Each face as triangles, fanned from its first corner. */
const triangles = (part) => part.faces.flatMap((face) => face.slice(1, -1).map((_, k) => [face[0], face[k + 1], face[k + 2]]));

/** A closed part wound outwards encloses a positive volume (the divergence theorem). */
function assertOutward(part) {
  const volume = triangles(part).reduce((sum, corners) => {
    const [a, b, c] = corners.map((index) => part.vertices[index]);
    return sum + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }, 0);
  if (!(volume > 0)) throw new Error(`${part.name} is wound inwards (volume ${volume})`);
  return part;
}

const RING = [
  { ...assertOutward(band()), layer: "Metal", material: "Gold" },
  { ...assertOutward(stone()), layer: "Gem", material: "Diamond" },
];

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

/** A STEP real, to the micron: always a decimal point, as the format requires. */
function real(value) {
  const rounded = Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(6));
  const text = String(rounded);
  return /[.eE]/.test(text) ? text.replace("e", "E") : `${text}.`;
}

const sub = (a, b) => a.map((value, k) => value - b[k]);
const length = (v) => Math.hypot(...v);
const unit = (v) => v.map((value) => value / length(v));

/** A polygon's normal by Newell's method: outward for a counter-clockwise face. */
function normalOf(points) {
  const n = [0, 0, 0];
  points.forEach((p, k) => {
    const q = points[(k + 1) % points.length];
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  });
  return unit(n);
}

/** ISO 10303-21 (AP214): each part a manifold solid of planar faces bounded by lines, one product each. */
function toStep(parts) {
  const lines = [];
  let next = 1;
  const add = (entity) => {
    const id = next++;
    lines.push(`#${id}=${entity};`);
    return `#${id}`;
  };
  const point = (p) => add(`CARTESIAN_POINT('',(${p.map(real).join(",")}))`);
  const direction = (d) => add(`DIRECTION('',(${d.map(real).join(",")}))`);
  const application = add("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${application})`);
  const millimetre = add("( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )");
  const radian = add("( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )");
  const steradian = add("( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )");
  const uncertainty = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),${millimetre},'distance_accuracy_value','confusion accuracy')`);
  const context = add(
    `( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${uncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${millimetre},${radian},${steradian})) REPRESENTATION_CONTEXT('Context #1','3D Context with UNIT and UNCERTAINTY') )`,
  );
  const productContext = add(`PRODUCT_CONTEXT('',${application},'mechanical')`);
  const definitionContext = add(`PRODUCT_DEFINITION_CONTEXT('part definition',${application},'design')`);
  const origin = add(`AXIS2_PLACEMENT_3D('',${point([0, 0, 0])},${direction([0, 0, 1])},${direction([1, 0, 0])})`);

  for (const part of parts) {
    const corners = part.vertices.map((p) => point(p));
    const vertices = corners.map((corner) => add(`VERTEX_POINT('',${corner})`));
    const edges = new Map();
    const orientedEdge = (a, b) => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!edges.has(key)) {
        const span = sub(part.vertices[b], part.vertices[a]);
        const line = add(`LINE('',${corners[a]},${add(`VECTOR('',${direction(unit(span))},${real(length(span))})`)})`);
        edges.set(key, { edge: add(`EDGE_CURVE('',${vertices[a]},${vertices[b]},${line},.T.)`), from: a });
      }
      const { edge, from } = edges.get(key);
      return add(`ORIENTED_EDGE('',*,*,${edge},${from === a ? ".T." : ".F."})`);
    };
    const faces = part.faces.map((face) => {
      const points = face.map((index) => part.vertices[index]);
      const loop = add(`EDGE_LOOP('',(${face.map((a, k) => orientedEdge(a, face[(k + 1) % face.length])).join(",")}))`);
      const bound = add(`FACE_OUTER_BOUND('',${loop},.T.)`);
      const axis = add(`AXIS2_PLACEMENT_3D('',${corners[face[0]]},${direction(normalOf(points))},${direction(unit(sub(points[1], points[0])))})`);
      return add(`ADVANCED_FACE('',(${bound}),${add(`PLANE('',${axis})`)},.T.)`);
    });
    const solid = add(`MANIFOLD_SOLID_BREP('${part.name}',${add(`CLOSED_SHELL('',(${faces.join(",")}))`)})`);
    const shape = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(${origin},${solid}),${context})`);
    const product = add(`PRODUCT('${part.name}','${part.name}','',(${productContext}))`);
    add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,(${product}))`);
    const formation = add(`PRODUCT_DEFINITION_FORMATION('','',${product})`);
    const definition = add(`PRODUCT_DEFINITION('design','',${formation},${definitionContext})`);
    add(`SHAPE_DEFINITION_REPRESENTATION(${add(`PRODUCT_DEFINITION_SHAPE('','',${definition})`)},${shape})`);
  }
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('Mist Studio convert fixture'),'2;1');",
    "FILE_NAME('ring.step','2026-10-06T00:00:00',('Mist Studio'),(''),'tests/convert/make-fixtures.mjs','','');",
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    "ENDSEC;",
    "DATA;",
    ...lines,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}

const number = (value) => String(Number(value.toFixed(6)));

/** OBJ with a material library: each part an object of polygon faces in its material. */
function toObj(parts, mtllib) {
  const lines = [`mtllib ${mtllib}`];
  let base = 1;
  for (const part of parts) {
    lines.push(`o ${part.name}`, `usemtl ${part.material}`);
    for (const p of part.vertices) lines.push(`v ${p.map(number).join(" ")}`);
    for (const face of part.faces) lines.push(`f ${face.map((index) => index + base).join(" ")}`);
    base += part.vertices.length;
  }
  return `${lines.join("\n")}\n`;
}

const MTL = "newmtl Gold\nKd 1 0.766 0.336\nnewmtl Diamond\nKd 1 1 1\n";

/** One binary STL of every part's triangles, scaled by `scale` (0.1: centimetres). */
function toBinaryStl(parts, scale) {
  const all = parts.flatMap((part) => triangles(part).map((corners) => corners.map((index) => part.vertices[index])));
  const buffer = Buffer.alloc(84 + all.length * 50);
  buffer.write("Mist Studio convert fixture, in centimetres", 0, "latin1");
  buffer.writeUInt32LE(all.length, 80);
  all.forEach((corners, t) => {
    const offset = 84 + t * 50;
    const normal = normalOf(corners);
    normal.forEach((value, k) => buffer.writeFloatLE(value, offset + k * 4));
    corners.forEach((p, c) => p.forEach((value, k) => buffer.writeFloatLE(value * scale, offset + 12 + c * 12 + k * 4)));
  });
  return buffer;
}

/** A Rhino 8 model in millimetres: each part a mesh on its layer, named for itself. */
async function toRhino(parts) {
  const rhino = await require("rhino3dm")();
  const doc = new rhino.File3dm();
  doc.settings().modelUnitSystem = rhino.UnitSystem.Millimeters;
  for (const part of parts) {
    const layer = new rhino.Layer();
    layer.name = part.layer;
    const layerIndex = doc.layers().add(layer);
    const mesh = new rhino.Mesh();
    for (const [x, y, z] of part.vertices) mesh.vertices().add(x, y, z);
    for (const face of part.faces) {
      if (face.length === 4) mesh.faces().addQuadFace(...face);
      else for (const [a, b, c] of triangles({ faces: [face] })) mesh.faces().addTriFace(a, b, c);
    }
    mesh.normals().computeNormals();
    mesh.compact();
    const attributes = new rhino.ObjectAttributes();
    attributes.layerIndex = layerIndex;
    attributes.name = part.name;
    doc.objects().add(mesh, attributes);
  }
  return Buffer.from(doc.toByteArray());
}

const write = (name, content) => {
  writeFileSync(path.join(HERE, name), content);
  console.log(`wrote tests/convert/${name} (${Buffer.byteLength(content)} bytes)`);
};

write("ring.step", toStep(RING));
write("ring.obj", toObj(RING, "ring.mtl"));
write("ring.mtl", MTL);
write("ring-cm.stl", toBinaryStl(RING, 0.1));
write("ring.3dm", await toRhino(RING));
