import * as THREE from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import { mkdir } from 'node:fs/promises';

// Original procedural demo, with separate CAD-compatible metal and stone slots.
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('MIST Solitaire');
const metal = doc.createMaterial('Metal 1').setBaseColorFactor([0.82,0.85,0.89,1]).setMetallicFactor(1).setRoughnessFactor(0.12);
const gem = doc.createMaterial('Gem 1').setBaseColorFactor([0.94,0.98,1,1]).setMetallicFactor(0).setRoughnessFactor(0.02);
function add(geometry, name, material) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const primitive = doc.createPrimitive().setMaterial(material);
  for (const [key, attr] of [['POSITION','position'],['NORMAL','normal']]) {
    primitive.setAttribute(key, doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.getAttribute(attr).array)).setBuffer(buffer));
  }
  const mesh = doc.createMesh(name).addPrimitive(primitive);
  scene.addChild(doc.createNode(name).setMesh(mesh));
}
const band = new THREE.TorusGeometry(0.72,0.063,20,128);
band.scale(1,1,1.35);
add(band,'Metal 1',metal);
// Six curved prongs rise from the shoulder into the stone girdle.
for (let i=0;i<6;i++) {
  const a=i*Math.PI/3;
  const x=Math.cos(a), z=Math.sin(a);
  const curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(x*.11,.62,z*.11),
    new THREE.Vector3(x*.20,.76,z*.20),
    new THREE.Vector3(x*.27,.88,z*.27),
    new THREE.Vector3(x*.25,.94,z*.25),
  ]);
  add(new THREE.TubeGeometry(curve,16,.019,8,false),'Metal 1',metal);
  const tip=new THREE.SphereGeometry(.022,12,8);tip.translate(x*.25,.94,z*.25);add(tip,'Metal 1',metal);
}
const basket=new THREE.TorusGeometry(.20,.018,8,48);basket.rotateX(Math.PI/2);basket.translate(0,.76,0);add(basket,'Metal 1',metal);
// Flat faces preserve a brilliant-cut silhouette and normals, instead of a smooth glass ball.
const tiers=[[.15,1.04],[.275,.915],[.275,.90],[.155,.77],[.005,.68]];
const n=16, vertices=[];
const point=(tier,i)=>{const [r,y]=tiers[tier];const a=i*2*Math.PI/n;return [r*Math.cos(a),y,r*Math.sin(a)];};
const tri=(a,b,c)=>vertices.push(...a,...b,...c);
for(let i=0;i<n;i++) {
  tri([0,1.04,0],point(0,i+1),point(0,i));
  for(let t=0;t<tiers.length-1;t++) {
    tri(point(t,i),point(t,i+1),point(t+1,i));
    tri(point(t,i+1),point(t+1,i+1),point(t+1,i));
  }
  tri([0,.675,0],point(4,i),point(4,i+1));
}
const diamond=new THREE.BufferGeometry();diamond.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));diamond.computeVertexNormals();add(diamond,'Gem 1',gem);
await mkdir('public/models/mist-solitaire',{recursive:true});
await new NodeIO().write('public/models/mist-solitaire/ring.glb',doc);
