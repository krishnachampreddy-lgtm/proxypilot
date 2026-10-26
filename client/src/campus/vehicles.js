import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from './util.js';

/* School buses, cars and auto-rickshaws, with glossy paint and real glass. */

const paint = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
const GLASS = new THREE.MeshPhysicalMaterial({ color: '#1a2228', roughness: 0.04, metalness: 0.2, envMapIntensity: 1.8 });
const RUBBER = new THREE.MeshStandardMaterial({ color: '#121212', roughness: 0.92 });
const RIM = new THREE.MeshStandardMaterial({ color: '#b9bdc2', roughness: 0.3, metalness: 0.9 });
const BLACK = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.6 });
const HEAD = new THREE.MeshStandardMaterial({ color: '#f4f2ea', emissive: '#fff4d6', emissiveIntensity: 0.2, roughness: 0.2 });
const TAIL = new THREE.MeshStandardMaterial({ color: '#8a1410', emissive: '#ff2a1a', emissiveIntensity: 0.4, roughness: 0.3 });

/** Builds one vehicle template: parts are merged per material, then the template is cloned. */
function template(parts) {
  const byMat = new Map();
  for (const [geo, mat, x, y, z, o = {}] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (o.rx) g.rotateX(o.rx);
    if (o.ry) g.rotateY(o.ry);
    if (o.rz) g.rotateZ(o.rz);
    g.translate(x, y, z);
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(g);
  }
  const group = new THREE.Group();
  for (const [mat, list] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

function wheels(parts, xs, zs, r = 0.45, w = 0.32) {
  const tyre = new THREE.CylinderGeometry(r, r, w, 20);
  const rim = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 16);
  for (const x of xs) for (const z of zs) {
    parts.push([tyre, RUBBER, x, r, z, { rz: Math.PI / 2 }]);
    parts.push([rim, RIM, x, r, z, { rz: Math.PI / 2 }]);
  }
}

function busTemplate() {
  const yellow = paint('#f2a90c');
  const sideText = canvasTexture(1024, 96, (g) => {
    g.fillStyle = '#f2a90c';
    g.fillRect(0, 0, 1024, 96);
    g.fillStyle = '#6b1e14';
    g.font = '700 60px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('PROXYPILOT SCHOOL', 512, 50);
  });
  const signTex = canvasTexture(512, 96, (g) => {
    g.fillStyle = '#f2a90c';
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#111';
    g.font = '800 64px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SCHOOL BUS', 256, 52);
  });
  const side = new THREE.MeshStandardMaterial({ map: sideText, roughness: 0.4 });
  const sign = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4 });
  const stripe = paint('#6b1e14');
  const parts = [
    [new RoundedBoxGeometry(2.45, 2.6, 9.6, 4, 0.14), yellow, 0, 0.55 + 1.3, 0],
    [new THREE.BoxGeometry(2.47, 0.95, 8.0), GLASS, 0, 2.3, -0.5],
    [new THREE.BoxGeometry(2.2, 1.1, 0.04), GLASS, 0, 2.25, 4.8, { rx: -0.08 }],
    [new THREE.BoxGeometry(2.2, 0.9, 0.04), GLASS, 0, 2.3, -4.81],
    [new THREE.BoxGeometry(2.48, 0.12, 9.62), stripe, 0, 1.55, 0],
    [new THREE.BoxGeometry(2.48, 0.08, 9.62), stripe, 0, 1.28, 0],
    [new THREE.BoxGeometry(2.5, 0.28, 0.25), BLACK, 0, 0.7, 4.85],
    [new THREE.BoxGeometry(2.5, 0.28, 0.25), BLACK, 0, 0.7, -4.85],
    [new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), HEAD, 0.85, 1.1, 4.82, { rx: Math.PI / 2 }],
    [new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), HEAD, -0.85, 1.1, 4.82, { rx: Math.PI / 2 }],
    [new THREE.BoxGeometry(0.3, 0.16, 0.05), TAIL, 0.9, 1.0, -4.82],
    [new THREE.BoxGeometry(0.3, 0.16, 0.05), TAIL, -0.9, 1.0, -4.82],
    [new THREE.BoxGeometry(0.05, 0.5, 0.3), BLACK, 1.35, 2.3, 4.6],
    [new THREE.BoxGeometry(0.05, 0.5, 0.3), BLACK, -1.35, 2.3, 4.6],
    [new THREE.BoxGeometry(2.3, 0.06, 9.2), yellow, 0, 3.17, 0],
  ];
  for (let z = -4.2; z <= 3.4; z += 1.25) parts.push([new THREE.BoxGeometry(2.49, 0.95, 0.07), yellow, 0, 2.3, z]);
  for (const s of [-1, 1]) for (let y = 2.0; y <= 2.6; y += 0.3) parts.push([new THREE.BoxGeometry(0.03, 0.025, 8.0), new THREE.MeshStandardMaterial({ color: '#d9d9d9', metalness: 0.9, roughness: 0.3 }), s * 1.26, y, -0.5]);
  parts.push([new THREE.PlaneGeometry(4.2, 0.4), side, 1.235, 1.84, -0.4, { ry: Math.PI / 2 }]);
  parts.push([new THREE.PlaneGeometry(4.2, 0.4), side, -1.235, 1.84, -0.4, { ry: -Math.PI / 2 }]);
  parts.push([new THREE.PlaneGeometry(1.6, 0.3), sign, 0, 2.95, 4.81]);
  parts.push([new THREE.PlaneGeometry(1.6, 0.3), sign, 0, 2.95, -4.81, { ry: Math.PI }]);
  wheels(parts, [1.05, -1.05], [3.0, -2.9], 0.5, 0.34);
  return template(parts);
}

function carTemplate(color) {
  const body = paint(color);
  const parts = [
    [new RoundedBoxGeometry(1.72, 0.72, 3.95, 4, 0.18), body, 0, 0.36 + 0.3, 0],
    [new RoundedBoxGeometry(1.52, 0.62, 2.1, 4, 0.18), GLASS, 0, 1.25, -0.25],
    [new RoundedBoxGeometry(1.5, 0.08, 1.9, 2, 0.04), body, 0, 1.57, -0.3],
    [new THREE.BoxGeometry(0.34, 0.12, 0.04), HEAD, 0.6, 0.78, 1.97],
    [new THREE.BoxGeometry(0.34, 0.12, 0.04), HEAD, -0.6, 0.78, 1.97],
    [new THREE.BoxGeometry(0.34, 0.12, 0.04), TAIL, 0.6, 0.82, -1.97],
    [new THREE.BoxGeometry(0.34, 0.12, 0.04), TAIL, -0.6, 0.82, -1.97],
    [new THREE.BoxGeometry(1.74, 0.16, 0.12), BLACK, 0, 0.45, 1.98],
    [new THREE.BoxGeometry(1.74, 0.16, 0.12), BLACK, 0, 0.45, -1.98],
  ];
  wheels(parts, [0.78, -0.78], [1.25, -1.3], 0.31, 0.2);
  return template(parts);
}

function autoTemplate() {
  const green = paint('#2f7d3a');
  const canopy = paint('#f0c419');
  const parts = [
    [new RoundedBoxGeometry(1.35, 0.9, 2.6, 3, 0.12), green, 0, 0.75, 0],
    [new RoundedBoxGeometry(1.42, 0.95, 2.2, 3, 0.2), canopy, 0, 1.65, -0.15],
    [new THREE.BoxGeometry(1.2, 0.55, 0.04), GLASS, 0, 1.55, 1.12, { rx: -0.2 }],
    [new THREE.BoxGeometry(0.2, 0.2, 0.05), HEAD, 0, 0.95, 1.31],
  ];
  wheels(parts, [0.6, -0.6], [-0.8], 0.24, 0.14);
  wheels(parts, [0], [0.9], 0.24, 0.14);
  return template(parts);
}

export function buildVehicles(scene, rng) {
  const bus = busTemplate();
  const cars = ['#f4f4f2', '#b8bcc0', '#a3201b', '#3b4249', '#1f4f8b', '#e9e6dc'].map(carTemplate);
  const auto = autoTemplate();
  const group = new THREE.Group();
  scene.add(group);

  // parked school buses in the bus bay
  for (const [x, rot] of [[20.5, 0], [29.5, 0], [38.5, 0]]) {
    const b = bus.clone();
    b.position.set(x, 0.06, 30);
    b.rotation.y = rot;
    group.add(b);
  }
  // teachers' cars
  [[-30, 34], [-27, 34], [-24, 34]].forEach(([x, z], i) => {
    const c = cars[i % cars.length].clone();
    c.position.set(x, 0.05, z);
    group.add(c);
  });
  // autos waiting outside the gate
  [[12, 47.4], [16, 47.4]].forEach(([x, z]) => {
    const a = auto.clone();
    a.position.set(x, 0.06, z);
    a.rotation.y = -Math.PI / 2;
    group.add(a);
  });

  // traffic on the main road
  const traffic = [];
  const lane = (dir) => (dir > 0 ? 49.5 : 56.5);
  for (let i = 0; i < 14; i++) {
    const dir = i % 2 ? 1 : -1;
    const kind = i % 7 === 0 ? bus : i % 3 === 0 ? auto : cars[i % cars.length];
    const v = kind.clone();
    v.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(v);
    traffic.push({ obj: v, dir, x: rng() * 600 - 300, speed: kind === bus ? 7 : kind === auto ? 8 : 9 + rng() * 5, z: lane(dir) });
  }

  return {
    group,
    update(dt) {
      for (const t of traffic) {
        // traffic slows down at the zebra crossing in front of the school
        const slow = Math.abs(t.x) < 25 ? 0.55 : 1;
        t.x += t.dir * t.speed * slow * dt;
        if (t.x > 320) t.x = -320;
        if (t.x < -320) t.x = 320;
        t.obj.position.set(t.x, 0.06, t.z);
      }
    },
  };
}
