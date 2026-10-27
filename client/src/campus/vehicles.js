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
  const chrome = new THREE.MeshStandardMaterial({ color: '#d9d9d9', metalness: 0.9, roughness: 0.3 }); // one material, so the strips merge into one draw
  for (const s of [-1, 1]) for (let y = 2.0; y <= 2.6; y += 0.3) parts.push([new THREE.BoxGeometry(0.03, 0.025, 8.0), chrome, s * 1.26, y, -0.5]);
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

let driveStamp = 0;

/**
 * A vehicle that drives along a smooth route, slowing for curves and stopping at the end.
 * It never drives into another vehicle: if anything is in the way ahead it waits (see `blocked`).
 */
export class Driver {
  constructor(obj, dims) {
    this.obj = obj;
    this.dims = dims; // { len, wid }
    this.blocked = false;
    this.stamp = 0;
    this.curve = null;
    this.s = 0;
    this.len = 0;
    this.speed = 0;
    this.max = 8;
    this.active = false;
    this.onEnd = null;
    this.hold = false;
  }
  drive(points, { max = 8, onEnd = null, start = 0, reverse = false } = {}) {
    this.reverse = reverse; // reversing: the vehicle faces against its direction of travel
    this.curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], 0.06, p[1])), false, 'centripetal', 0.3);
    this.len = this.curve.getLength();
    this.s = 0;
    this.max = max;
    this.speed = start;
    this.onEnd = onEnd;
    this.active = true;
    this.stamp = ++driveStamp; // who set off first gets to go first at a stand-off
    this.obj.visible = true;
    this.place();
  }
  place() {
    const t = Math.min(1, this.s / this.len);
    const p = this.curve.getPointAt(t);
    const d = this.curve.getTangentAt(Math.min(0.999, t));
    this.obj.position.copy(p);
    this.obj.rotation.y = Math.atan2(d.x, d.z) + (this.reverse ? Math.PI : 0);
  }
  update(dt) {
    if (!this.active) return;
    const left = this.len - this.s;
    // ease off near the end and in tight bends
    const t = Math.min(0.999, this.s / this.len);
    const a = this.curve.getTangentAt(t);
    const b = this.curve.getTangentAt(Math.min(0.999, t + 6 / this.len));
    const bend = 1 - Math.max(0, a.dot(b));
    let target = this.max * (1 - Math.min(0.7, bend * 6));
    target = Math.min(target, Math.max(0.8, left * 0.6));
    if (this.hold || this.blocked) target = 0;
    // brake harder than we accelerate
    this.speed += (target - this.speed) * Math.min(1, dt * (target < this.speed ? 4 : 1.4));
    this.s = Math.min(this.len, this.s + this.speed * dt);
    this.place();
    if (left < 0.05) {
      this.active = false;
      this.speed = 0;
      const cb = this.onEnd;
      this.onEnd = null;
      cb?.(this);
    }
  }
}

export function buildVehicles(scene, rng, P) {
  const bus = busTemplate();
  const cars = ['#f4f4f2', '#b8bcc0', '#a3201b', '#3b4249', '#1f4f8b', '#e9e6dc'].map(carTemplate);
  const auto = autoTemplate();
  const group = new THREE.Group();
  scene.add(group);

  // the school's own vehicles are moved by the school-day simulation
  const DIMS = { bus: { len: 9.8, wid: 2.55 }, car: { len: 4.0, wid: 1.8 }, auto: { len: 2.7, wid: 1.45 } };
  const make = (tpl, dims) => {
    const o = tpl.clone();
    o.visible = false;
    group.add(o);
    return new Driver(o, dims);
  };
  const fleet = {
    buses: [0, 1, 2, 3].map(() => make(bus, DIMS.bus)),
    autos: [0, 1, 2, 3, 4, 5].map(() => make(auto, DIMS.auto)),
    cars: [0, 1, 2].map((i) => make(cars[i], DIMS.car)),
  };
  const fleetList = [...fleet.buses, ...fleet.autos, ...fleet.cars];

  // through traffic on the main road (it waits while a school bus turns at the gate)
  const traffic = [];
  const lane = (dir) => (dir > 0 ? 49.5 : 56.5);
  for (let i = 0; i < P.traffic; i++) {
    const dir = i % 2 ? 1 : -1;
    const kind = i % 7 === 0 ? bus : i % 3 === 0 ? auto : cars[i % cars.length];
    const v = kind.clone();
    v.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(v);
    traffic.push({ obj: v, dir, x: rng() * 600 - 300, speed: kind === bus ? 7 : kind === auto ? 8 : 9 + rng() * 5, v: 0, z: lane(dir), dims: kind === bus ? DIMS.bus : kind === auto ? DIMS.auto : DIMS.car });
  }

  // ---- keeping vehicles apart ----
  // Every school vehicle looks ahead along its heading; anything whose footprint overlaps
  // the strip in front of it (parked or moving) makes it wait. Two vehicles that block
  // each other (at a merge) resolve it by who set off first.
  const others = [];
  const halfAlong = (o, fx, fz) => {
    // half the size of vehicle o measured along direction (fx, fz)
    const r = o.obj.rotation.y;
    const c = Math.abs(Math.sin(r) * fx + Math.cos(r) * fz);
    return (o.dims.len / 2) * c + (o.dims.wid / 2) * Math.sqrt(Math.max(0, 1 - c * c));
  };
  const blocker = (d) => {
    const r = d.obj.rotation.y + (d.reverse ? Math.PI : 0); // look where it's going
    const fx = Math.sin(r);
    const fz = Math.cos(r);
    const p = d.obj.position;
    const reach = d.dims.len / 2 + 1.6 + d.speed * 0.9;
    for (const o of others) {
      if (o === d || !o.obj.visible) continue;
      const rx = o.obj.position.x - p.x;
      const rz = o.obj.position.z - p.z;
      const along = rx * fx + rz * fz;
      if (along <= 0) continue;
      const side = Math.abs(rx * fz - rz * fx);
      const gap = along - halfAlong(o, fx, fz) - d.dims.len / 2;
      if (gap + d.dims.len / 2 < reach && side < d.dims.wid / 2 + halfAlong(o, fz, -fx) + 0.35) {
        d.blockGap = gap;
        return o;
      }
    }
    return null;
  };

  let gateBusy = false;
  return {
    group,
    fleet,
    setGateBusy(b) {
      gateBusy = b;
    },
    /** true when no vehicle is within r metres of (x, z) — used before a vehicle sets off onto the road */
    clearAt(x, z, r = 9) {
      for (const d of fleetList) if (d.obj.visible && Math.hypot(d.obj.position.x - x, d.obj.position.z - z) < r) return false;
      for (const t of traffic) if (Math.hypot(t.x - x, t.z - z) < r) return false;
      return true;
    },
    /** footprints of every vehicle on show (for tests) */
    footprints() {
      const out = [];
      const add = (o, name) => o.obj.visible && out.push({ name, x: o.obj.position.x, z: o.obj.position.z, r: o.obj.rotation.y, len: o.dims.len, wid: o.dims.wid });
      fleet.buses.forEach((d, i) => add(d, 'bus' + i));
      fleet.autos.forEach((d, i) => add(d, 'auto' + i));
      fleet.cars.forEach((d, i) => add(d, 'car' + i));
      traffic.forEach((t, i) => add(t, 'traffic' + i));
      return out;
    },
    update(dt) {
      others.length = 0;
      for (const d of fleetList) others.push(d);
      for (const t of traffic) others.push(t);
      for (const d of fleetList) d.blockedBy = d.active ? blocker(d) : null;
      for (const d of fleetList) {
        const b = d.blockedBy;
        // a stand-off (each in the other's way): the one that set off first edges on, if there's room
        d.blocked = Boolean(b) && !(b.blockedBy === d && d.stamp < b.stamp && d.blockGap > 1.5);
      }
      for (const d of fleetList) d.update(dt);
      // keep a safe gap to the vehicle ahead in the same lane and stop for turning buses
      for (const t of traffic) {
        let want = t.speed * (Math.abs(t.x) < 25 ? 0.6 : 1);
        // stop at the line before the gate while a school vehicle turns in or out
        const stopLine = t.dir > 0 ? -22 : 22;
        const toLine = (stopLine - t.x) * t.dir;
        if (gateBusy && toLine > 0 && toLine < 16) want = Math.min(want, toLine * 0.7);
        for (const o of traffic) {
          if (o === t || o.dir !== t.dir) continue;
          const gap = (o.x - t.x) * t.dir - (o.dims.len + t.dims.len) / 2; // bumper to bumper
          if (gap > -2 && gap < 10) want = Math.min(want, Math.max(0, (gap - 2.5) * 1.5));
        }
        // school vehicles pulling out onto the road, or waiting on it
        for (const d of fleetList) {
          if (!d.obj.visible) continue;
          const dz = Math.abs(d.obj.position.z - t.z);
          if (dz > halfAlong(d, 0, 1) + t.dims.wid / 2 + 0.3) continue;
          const gap = (d.obj.position.x - t.x) * t.dir - halfAlong(d, 1, 0) - t.dims.len / 2;
          if (gap > -1 && gap < 14) want = Math.min(want, Math.max(0, (gap - 2.5) * 1.5));
        }
        t.v += (want - t.v) * Math.min(1, dt * 2);
        t.x += t.dir * t.v * dt;
        if (t.x > 320) t.x = -320;
        if (t.x < -320) t.x = 320;
        t.obj.position.set(t.x, 0.06, t.z);
      }
    },
  };
}
