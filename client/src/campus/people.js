import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { simplifyGeometry, compactGeometry } from './lod.js';

/*
  Students and teachers.
  An animated human figure (walk / run / idle / talking) is dressed in school uniform by a
  shader that paints each body region from its rest-pose position: shirt, tie, belt,
  trousers, socks, shoes, skin and hair. Girls also wear a pleated skirt and two plaits with
  ribbons; women teachers wear sarees (pleated skirt, border, pallu over the shoulder, a bun).
  - teachers and the students in games are fully animated (skinned, with blended walk/run/idle)
  - the student body — a thousand and more, streaming in with school bags, standing in
    assembly, chatting in groups at lunch, going home — uses frames of the animations baked
    into plain meshes and drawn with instancing, in two levels of detail, and only the ones
    in view are drawn
  - everyone sitting down (students at their desks, teachers at the board and in the staff
    room, the HOD, readers in the library) is drawn the same way from posed frames
*/

const WALK_FRAMES = 8;
const RUN_FRAMES = 6;
const TALK_FRAMES = 3; // per talking clip (nodding, shaking the head)

// strips in front of moving vehicles (set by the vehicles each frame): nobody steps into one
let ZONES = [];
export const setVehicleZones = (z) => (ZONES = z);
// a zone has a "path" strip (where the vehicle actually drives) and a wider waiting band around it
const sideOf = (z, x, y) => Math.abs((x - z.x) * z.fz - (y - z.z) * z.fx);
const alongOf = (z, x, y) => (x - z.x) * z.fx + (y - z.z) * z.fz;
const inZone = (z, x, y) => {
  const a = alongOf(z, x, y);
  return a > z.back && a < z.front && sideOf(z, x, y) < z.half;
};
/**
 * What someone on foot should do about the vehicles around them, given the step they want to take:
 * 0 = go ahead · 1 = wait (don't step into a vehicle's zone, or from the waiting band into its path)
 * · a zone object = they're standing in a vehicle's path ahead of it: step aside out of it
 */
const yieldTo = (x0, z0, x1, z1) => {
  // standing in a vehicle's path (ahead of its nose): get out of the way first, sideways
  for (const z of ZONES) {
    if (inZone(z, x0, z0) && sideOf(z, x0, z0) < z.path && alongOf(z, x0, z0) > z.nose) return z;
  }
  for (const z of ZONES) {
    if (!inZone(z, x0, z0)) {
      if (inZone(z, x1, z1)) return 1; // don't step into a vehicle's zone
      continue;
    }
    if (sideOf(z, x0, z0) >= z.path && sideOf(z, x1, z1) < z.path) return 1; // nor from its edge into its path
  }
  return 0;
};

/** moves one person along their route; returns true while they're walking */
function step(a, dt, tmp) {
  if (a.holdT > 0) {
    // waiting for a friend (or their turn at a door)
    a.holdT -= dt;
    return false;
  }
  if (a.path && a.seg < a.path.length) {
    const goal = a.path[a.seg];
    tmp.subVectors(goal, a.pos);
    tmp.y = 0;
    const d = tmp.length();
    const speed = (a.run ? 3.0 : 1.2 * (a.pace || 1)) * a.size;
    if (a.segLen < 0) a.segLen = Math.max(d, 0.001);
    if (d < 0.22) {
      a.pos.y = goal.y;
      a.seg++;
      a.y0 = a.pos.y;
      a.segLen = -1;
      if (goal.hold > 0) a.holdT = goal.hold;
      if (a.seg >= a.path.length) {
        a.wait = a.waitAfter || 0;
        if (!a.wait) {
          const cb = a.onArrive;
          a.onArrive = null;
          cb?.(a);
        }
      }
      return false;
    }
    tmp.normalize();
    const stepLen = Math.min(d, speed * dt);
    // look out for vehicles: wait at the edge, or step aside if one is coming at you
    if (a.pos.y < 0.3 && ZONES.length) {
      const y = yieldTo(a.pos.x, a.pos.z, a.pos.x + tmp.x * (stepLen + 0.35), a.pos.z + tmp.z * (stepLen + 0.35));
      if (y === 1) {
        // waiting for a vehicle to pass (but nobody waits for ever: after a while they edge on)
        a.yieldT = (a.yieldT || 0) + dt;
        if (a.yieldT < 7) return false;
        if (a.yieldT > 8) a.yieldT = 0;
      } else a.yieldT = 0;
      if (y && y !== 1) {
        const s = (a.pos.x - y.x) * y.fz - (a.pos.z - y.z) * y.fx >= 0 ? 1 : -1;
        tmp.set(y.fz * s, 0, -y.fx * s);
        a.pos.addScaledVector(tmp, Math.min(speed, 1.4) * dt);
        a.heading += Math.atan2(Math.sin(Math.atan2(tmp.x, tmp.z) - a.heading), Math.cos(Math.atan2(tmp.x, tmp.z) - a.heading)) * Math.min(1, dt * 7);
        return true;
      }
    }
    a.pos.addScaledVector(tmp, stepLen);
    // height follows the walk smoothly (up and down stairs, onto the plinth)
    const k = Math.min(1, Math.max(0, (d - stepLen) / a.segLen));
    a.pos.y = goal.y + (a.y0 - goal.y) * k;
    const want = Math.atan2(tmp.x, tmp.z);
    let diff = want - a.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a.heading += diff * Math.min(1, dt * 7);
    return true;
  }
  if (a.wait > 0) {
    a.wait -= dt;
    if (a.face !== null) {
      let diff = a.face - a.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.heading += diff * Math.min(1, dt * 4);
    }
    if (a.wait <= 0) {
      const cb = a.onArrive;
      a.onArrive = null;
      cb?.(a);
    }
  }
  return false;
}

/**
 * shared route bookkeeping for both kinds of people
 * - each person walks a little to one side of the shared route (a.off), except at points marked exact
 * - lateral: friends walking together keep side by side, this far to the right of the route
 *   (points marked narrow — stairs, doors — squeeze them closer)
 * - holdAt: { pointIndex: seconds } to wait at a point (for friends to catch up, or a turn at a door)
 */
function setRoute(a, points, { run = false, onArrive = null, wait = 0, face = null, pace = 1, lateral = 0, holdAt = null, talk = false } = {}) {
  const n = points.length;
  a.path = points.map((p) => {
    const c = p.clone();
    c.exact = p.exact;
    c.narrow = p.narrow;
    c.hold = 0;
    return c;
  });
  const jitter = lateral ? 0.25 : 1;
  for (let i = 0; i < n; i++) {
    const c = a.path[i];
    if (c.exact) continue;
    if (lateral) {
      // perpendicular to the direction of travel through this point
      const prev = i > 0 ? points[i - 1] : a.pos;
      const next = i < n - 1 ? points[i + 1] : points[i];
      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      if (i === n - 1) {
        dx = points[i].x - prev.x;
        dz = points[i].z - prev.z;
      }
      const l = Math.hypot(dx, dz) || 1;
      const s = lateral * (c.narrow ? 0.4 : 1);
      c.x += (dz / l) * s;
      c.z += (-dx / l) * s;
    }
    if (a.off && i < n - 1 && !c.narrow) {
      c.x += a.off.x * jitter;
      c.z += a.off.z * jitter;
    }
  }
  if (holdAt) for (const [i, t] of Object.entries(holdAt)) if (a.path[i]) a.path[i].hold = t;
  a.seg = 0;
  a.y0 = a.pos.y;
  a.segLen = -1;
  a.holdT = 0;
  a.run = run;
  a.pace = pace;
  a.talk = talk;
  a.onArrive = onArrive;
  a.wait = n ? 0 : wait;
  a.waitAfter = wait;
  a.face = face;
}

// uniforms: shirt, trousers/skirt, tie, skin, hair, belt (or saree border), socks, shoes
const PALETTES = {
  boy: { shirt: '#f3f2ec', pants: '#26314d', tie: '#7c1f2c', skin: '#9c6a4a', hair: '#15100c', belt: '#151515', socks: '#efefea', shoe: '#0d0d0d', tieOn: 1, girl: 0 },
  boy2: { shirt: '#f3f2ec', pants: '#26314d', tie: '#7c1f2c', skin: '#7f5236', hair: '#120d0a', belt: '#151515', socks: '#efefea', shoe: '#0d0d0d', tieOn: 1, girl: 0 },
  girl: { shirt: '#f3f2ec', pants: '#26314d', tie: '#7c1f2c', skin: '#a8744f', hair: '#120d0a', belt: '#26314d', socks: '#efefea', shoe: '#0d0d0d', tieOn: 1, girl: 1 },
  teacher: { shirt: '#a9c4df', pants: '#2a2b2f', tie: '#a9c4df', skin: '#8a5a3c', hair: '#1a1410', belt: '#111111', socks: '#2a2b2f', shoe: '#2b1a10', tieOn: 0, girl: 0 },
  teacher2: { shirt: '#f2f0ea', pants: '#575c63', tie: '#f2f0ea', skin: '#9a6748', hair: '#22201e', belt: '#111111', socks: '#2a2b2f', shoe: '#1a1210', tieOn: 0, girl: 0 },
  teacher3: { shirt: '#e2d2ad', pants: '#4a3a2a', tie: '#e2d2ad', skin: '#7c5034', hair: '#0f0c0a', belt: '#2a1a10', socks: '#2a2b2f', shoe: '#2b1a10', tieOn: 0, girl: 0 },
  teacherF: { shirt: '#c99a3c', pants: '#8d2a4f', tie: '#8d2a4f', skin: '#9a6545', hair: '#100b08', belt: '#d8b04a', socks: '#8d2a4f', shoe: '#3a2414', tieOn: 0, girl: 1, saree: 1 },
  teacherF2: { shirt: '#7a1f2b', pants: '#1d6b74', tie: '#1d6b74', skin: '#a06c4a', hair: '#120c09', belt: '#e2bd52', socks: '#1d6b74', shoe: '#3a2414', tieOn: 0, girl: 1, saree: 1 },
  teacherF3: { shirt: '#2b3f7a', pants: '#d18a22', tie: '#d18a22', skin: '#8e5d3e', hair: '#0e0a08', belt: '#8a1f2b', socks: '#d18a22', shoe: '#3a2414', tieOn: 0, girl: 1, saree: 1 },
};
export const MALE_TEACHERS = ['teacher', 'teacher2', 'teacher3'];
export const FEMALE_TEACHERS = ['teacherF', 'teacherF2', 'teacherF3'];

function uniformMaterial(name) {
  const P = PALETTES[name];
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78 });
  m.onBeforeCompile = (sh) => {
    for (const k of ['shirt', 'pants', 'tie', 'skin', 'hair', 'belt', 'socks', 'shoe']) sh.uniforms['u_' + k] = { value: new THREE.Color(P[k]) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bindPos;\nvarying vec3 vB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvB = bindPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vB;\nuniform vec3 u_shirt, u_pants, u_tie, u_skin, u_hair, u_belt, u_socks, u_shoe;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 b = vB; float ax = abs(b.x);
          vec3 col = u_pants;
          if (b.y > 0.95) col = u_shirt;
          if (b.y > 1.18 && ax > 0.36) col = u_skin;
          if (b.y > 1.47 && ax < 0.2) col = u_skin;
          if (b.y > 1.6 && ax < 0.2 && b.z < 0.035) col = u_hair;
          ${P.girl ? 'if (b.y > 1.55 && ax < 0.2 && b.z < 0.05) col = u_hair; // longer hair at the nape' : ''}
          if (b.y > 1.71) col = u_hair;
          if (b.y > 0.9 && b.y <= 0.95) col = u_belt;
          ${name === 'girl' ? 'if (b.y < 0.6) col = u_skin; // below the skirt' : ''}
          if (b.y < ${name === 'girl' ? '0.47' : '0.16'}) col = u_socks; // girls wear knee-high socks
          if (b.y < 0.085) col = u_shoe;
          ${P.saree ? 'if (b.y > 1.18 && b.y < 1.3 && ax < 0.36 && ax > 0.05) col = u_skin; // a saree blouse leaves the midriff bare' : ''}
          ${P.tieOn ? 'if (ax < 0.032 && b.z > 0.075 && b.y > 1.05 && b.y < 1.45) col = mod(floor(b.y * 30.0), 3.0) < 1.0 ? u_hair : u_tie;' : ''}
          diffuseColor.rgb *= col;
        }`
      );
  };
  m.customProgramCacheKey = () => 'uniform-' + name;
  return m;
}

function skinnedParts(root) {
  const list = [];
  root.traverse((o) => o.isSkinnedMesh && list.push(o));
  return list;
}

// extra bone rotations for poses the file doesn't have
const SIT = [
  ['LeftUpLeg', -1.55, 0, 0], ['RightUpLeg', -1.55, 0, 0], ['LeftLeg', 1.55, 0, 0], ['RightLeg', 1.55, 0, 0],
  ['LeftArm', -0.5, 0, 0], ['RightArm', 0.5, 0, 0], ['LeftForeArm', 0, 0, -1.3], ['RightForeArm', 0, 0, 1.3], ['Spine', 0.12, 0, 0],
];

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
/** where the joints that clothes hang from are, for a posed copy of the figure (in `space`'s frame if given) */
function jointsOf(copy, space = null) {
  const get = (n) => copy.getObjectByName('mixamorig' + n);
  const P = (n) => {
    const v = get(n).getWorldPosition(new THREE.Vector3());
    return space ? space.worldToLocal(v) : v;
  };
  const headQ = get('Head').getWorldQuaternion(new THREE.Quaternion());
  if (space) headQ.premultiply(space.getWorldQuaternion(new THREE.Quaternion()).invert());
  return {
    hips: P('Hips'), upL: P('LeftUpLeg'), upR: P('RightUpLeg'), kneeL: P('LeftLeg'), kneeR: P('RightLeg'), footL: P('LeftFoot'), footR: P('RightFoot'),
    spine2: P('Spine2'), neck: P('Neck'), head: P('Head'), headQ, shL: P('LeftArm'), shR: P('RightArm'),
  };
}

/** Freezes the figure in one frame of an animation and returns a plain geometry (and its joints). */
function bakePose(gltf, clip, time, { surfaceOnly = false, rot = null } = {}) {
  const copy = cloneSkinned(gltf.scene);
  const mixer = new THREE.AnimationMixer(copy);
  mixer.clipAction(clip).play();
  mixer.update(time);
  if (rot) {
    for (const [name, x, y, z] of rot) {
      const b = copy.getObjectByName('mixamorig' + name);
      b?.quaternion.multiply(_q.setFromEuler(_e.set(x, y, z)));
    }
  }
  copy.updateMatrixWorld(true);
  const geos = [];
  for (const m of skinnedParts(copy)) {
    // the joints mesh: far away only its middle (the chest and belly piece) matters, the little rings don't
    const joints = m.geometry.attributes.position.count < 14000;
    m.skeleton.update();
    const src = m.geometry.attributes.position;
    const out = new Float32Array(src.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < src.count; i++) {
      v.fromBufferAttribute(src, i);
      m.applyBoneTransform(i, v);
      v.applyMatrix4(m.matrixWorld); // mesh space -> figure space (the rig is scaled inside the file)
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y;
      out[i * 3 + 2] = v.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    g.setAttribute('bindPos', src.clone());
    let index = m.geometry.index.array;
    if (joints && surfaceOnly) {
      const keep = [];
      const torso = (i) => Math.abs(src.getX(i)) < 0.34 && src.getY(i) > 0.8 && src.getY(i) < 1.62;
      for (let t = 0; t < index.length; t += 3) if (torso(index[t]) && torso(index[t + 1]) && torso(index[t + 2])) keep.push(index[t], index[t + 1], index[t + 2]);
      index = keep;
    }
    g.setIndex(Array.from(index));
    g.computeVertexNormals();
    geos.push(joints && surfaceOnly ? compactGeometry(g) : g);
  }
  const geo = mergeGeometries(geos);
  const joints = jointsOf(copy);
  if (rot) {
    // a sitting figure: put the feet on the floor
    geo.computeBoundingBox();
    const dy = -geo.boundingBox.min.y;
    geo.translate(0, dy, 0);
    for (const v of Object.values(joints)) if (v.isVector3) v.y += dy;
  }
  return { geo, joints };
}

// ---------------- clothes made from simple shapes ----------------
// written into plain arrays so the same code serves baked figures (colours by region) and
// animated teachers (rebuilt every frame from the joints, coloured by vertex)
class Shapes {
  constructor() {
    this.pos = [];
    this.idx = [];
    this.role = [];
  }
  vert(p, role) {
    this.pos.push(p.x, p.y, p.z);
    this.role.push(role);
    return this.role.length - 1;
  }
  /** a tube through rings {c, a, b, ra, rb, pleat}: c centre, a/b the ring's axes, ra/rb radii */
  tube(rings, seg, role) {
    const base = this.role.length;
    const p = new THREE.Vector3();
    for (const r of rings) {
      for (let k = 0; k < seg; k++) {
        const t = (k / seg) * Math.PI * 2;
        const ca = Math.cos(t);
        const sb = Math.sin(t);
        const pl = r.pleat ? 1 + r.pleat * Math.max(0, sb) * Math.sin(t * 9) : 1;
        p.copy(r.c).addScaledVector(r.a, ca * r.ra * pl).addScaledVector(r.b, sb * r.rb * pl);
        this.vert(p, role);
      }
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const a = base + i * seg + k;
        const b = base + i * seg + ((k + 1) % seg);
        const c = a + seg;
        const d = b + seg;
        this.idx.push(a, c, b, b, c, d);
      }
    }
  }
  /** a flat strip through points, `w` wide, facing `out` (both sides drawn) */
  strip(points, outs, w, role) {
    const base = this.role.length;
    const side = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < points.length; i++) {
      dir.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
      side.crossVectors(dir, outs[i]).normalize().multiplyScalar(w / 2);
      this.vert(p.copy(points[i]).add(side), role);
      this.vert(p.copy(points[i]).sub(side), role);
    }
    for (let i = 0; i < points.length - 1; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); // front
      this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); // back
    }
  }
  /** a small low-poly ball */
  ball(c, r, role, sx = 1, sy = 1, sz = 1) {
    const base = this.role.length;
    const W = 6;
    const H = 4;
    const p = new THREE.Vector3();
    for (let j = 0; j <= H; j++) {
      const phi = (j / H) * Math.PI;
      for (let k = 0; k < W; k++) {
        const th = (k / W) * Math.PI * 2;
        p.set(Math.sin(phi) * Math.cos(th) * r * sx, Math.cos(phi) * r * sy, Math.sin(phi) * Math.sin(th) * r * sz).add(c);
        this.vert(p, role);
      }
    }
    for (let j = 0; j < H; j++) {
      for (let k = 0; k < W; k++) {
        const a = base + j * W + k;
        const b = base + j * W + ((k + 1) % W);
        this.idx.push(a, b, a + W, b, b + W, a + W);
      }
    }
  }
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
/** ring axes perpendicular to the line from `from` to `to` (lateral first, then the other) */
function ringAxes(from, to) {
  const axis = new THREE.Vector3().subVectors(to, from).normalize();
  const a = X.clone().addScaledVector(axis, -X.dot(axis)).normalize();
  const b = new THREE.Vector3().crossVectors(axis, a).normalize();
  return [a, b];
}
const spreadAlong = (p, q, dir) => Math.abs(new THREE.Vector3().subVectors(p, q).dot(dir)) / 2;

/** school girl: pleated skirt, two plaits with ribbons */
function girlClothes(S, j, seg) {
  const W = j.hips.clone().add(new THREE.Vector3(0, 0.04, 0));
  const knees = j.kneeL.clone().add(j.kneeR).multiplyScalar(0.5);
  const hem = W.clone().lerp(knees, 0.8);
  const [a, b] = ringAxes(W, hem);
  const ra = Math.max(0.2, Math.abs(j.kneeL.x - j.kneeR.x) / 2 + 0.12);
  const rb = Math.max(0.17, spreadAlong(j.kneeL, j.kneeR, b) + 0.13);
  const mid = W.clone().lerp(hem, 0.45);
  const [ma, mb] = ringAxes(W, hem);
  S.tube(
    [
      { c: W, a: X, b: Z, ra: 0.165, rb: 0.125 },
      { c: mid, a: ma, b: mb, ra: (0.165 + ra) / 2 + 0.01, rb: (0.125 + rb) / 2 + 0.01, pleat: 0.03 },
      { c: hem, a, b, ra, rb, pleat: 0.05 },
    ],
    seg,
    'skirt'
  );
  // plaits from the back of the head down to the shoulder blades
  for (const side of [-1, 1]) {
    const s = new THREE.Vector3(side * 0.06, 0.07, -0.085).applyQuaternion(j.headQ).add(j.head);
    const e = s.clone().add(new THREE.Vector3(side * 0.025, -0.32, -0.03));
    const [pa, pb] = ringAxes(s, e);
    const rings = [];
    for (let i = 0; i <= 4; i++) {
      const c = s.clone().lerp(e, i / 4);
      const r = (i % 2 ? 0.026 : 0.034) * (1 - i * 0.08);
      rings.push({ c, a: pa, b: pb, ra: r, rb: r });
    }
    S.tube(rings, 5, 'hair');
    S.ball(e.clone().add(new THREE.Vector3(0, -0.01, 0)), 0.04, 'ribbon', 1.3, 0.8, 0.7);
  }
}

/** a teacher's saree: pleated drape to the ankles with a gold border, the pallu over the left shoulder, hair in a bun */
function sareeClothes(S, j, seg) {
  const W = j.hips.clone().add(new THREE.Vector3(0, 0.05, 0));
  const knees = j.kneeL.clone().add(j.kneeR).multiplyScalar(0.5);
  const feet = j.footL.clone().add(j.footR).multiplyScalar(0.5);
  const sitting = knees.y > W.y - 0.25;
  const hem = sitting ? knees.clone().lerp(feet, 0.85) : feet.clone().setY(Math.max(0.05, feet.y - 0.02));
  const border = hem.clone().lerp(sitting ? knees : W, 0.09);
  const kn = sitting ? knees.clone().add(new THREE.Vector3(0, 0.02, 0.08)) : knees;
  const [ka, kb] = ringAxes(W, kn);
  const [ha, hb] = ringAxes(kn, hem);
  const kra = Math.max(0.2, Math.abs(j.kneeL.x - j.kneeR.x) / 2 + 0.13);
  const krb = Math.max(0.18, spreadAlong(j.kneeL, j.kneeR, kb) + 0.13);
  const hra = Math.max(0.22, Math.abs(j.footL.x - j.footR.x) / 2 + 0.14);
  const hrb = Math.max(0.2, spreadAlong(j.footL, j.footR, hb) + 0.15);
  S.tube(
    [
      { c: W, a: X, b: Z, ra: 0.17, rb: 0.135 },
      { c: kn, a: ka, b: kb, ra: kra, rb: krb, pleat: 0.03 },
      { c: border, a: ha, b: hb, ra: hra * 0.98, rb: hrb * 0.98, pleat: 0.06 },
    ],
    seg,
    'saree'
  );
  S.tube(
    [
      { c: border, a: ha, b: hb, ra: hra * 0.985, rb: hrb * 0.985, pleat: 0.06 },
      { c: hem, a: ha, b: hb, ra: hra, rb: hrb, pleat: 0.06 },
    ],
    seg,
    'border'
  );
  // the pallu: from the right hip across the chest, over the left shoulder, down the back
  const chest = j.spine2.clone().lerp(j.neck, 0.2);
  const pts = [
    j.upR.clone().add(new THREE.Vector3(0.02, 0.12, 0.13)),
    chest.clone().add(new THREE.Vector3(0.0, -0.14, 0.165)),
    chest.clone().lerp(j.shL, 0.6).add(new THREE.Vector3(0.0, 0.03, 0.15)),
    j.shL.clone().add(new THREE.Vector3(-0.02, 0.085, 0.0)),
    j.shL.clone().lerp(j.spine2, 0.5).add(new THREE.Vector3(0, -0.05, -0.15)),
    j.hips.clone().add(new THREE.Vector3(0.1, 0.12, -0.15)),
  ];
  const outs = [Z, Z, Z.clone().add(Y).normalize(), Y, Z.clone().negate(), Z.clone().negate()];
  S.strip(pts, outs, 0.24, 'saree');
  // a bun at the back of the head
  S.ball(new THREE.Vector3(0, 0.03, -0.12).applyQuaternion(j.headQ).add(j.head), 0.07, 'hair', 1, 0.85, 0.8);
}

// where each kind of cloth sits in the uniform shader's colour regions
const ROLE_BIND = { skirt: [0, 0.7, 0], hair: [0, 1.8, 0], ribbon: [0, 1.0, 0], saree: [0, 0.5, 0], border: [0, 0.92, 0], shirt: [0, 1.1, 0] };
function shapesToBaked(S) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(S.pos, 3));
  const bind = new Float32Array(S.role.length * 3);
  S.role.forEach((r, i) => bind.set(ROLE_BIND[r], i * 3));
  g.setAttribute('bindPos', new THREE.BufferAttribute(bind, 3));
  g.setIndex(S.idx);
  g.computeVertexNormals();
  return g;
}

/** a baked body plus clothes, simplified to a level of detail */
function dressed(body, joints, kind, ratio, err = 0.2) {
  const base = compactGeometry(simplifyGeometry(body.clone(), ratio, err));
  const P = PALETTES[kind];
  const S = new Shapes();
  const seg = ratio < 0.05 ? 10 : 16;
  // the figure's torso is made of separate pieces with gaps between them: a shirt body inside closes them
  const waist = joints.hips.clone().add(new THREE.Vector3(0, 0.02, 0));
  const chest = joints.spine2.clone();
  const [ta, tb] = ringAxes(waist, chest);
  S.tube([{ c: waist, a: ta, b: tb, ra: 0.13, rb: 0.085 }, { c: waist.clone().lerp(chest, 0.5), a: ta, b: tb, ra: 0.145, rb: 0.095 }, { c: chest, a: ta, b: tb, ra: 0.15, rb: 0.1 }], ratio < 0.05 ? 8 : 12, 'shirt');
  if (kind === 'girl') girlClothes(S, joints, seg);
  else if (P.saree) sareeClothes(S, joints, seg);
  const extra = shapesToBaked(S);
  // the simplified body keeps only position, bindPos, normal and the index
  for (const k of Object.keys(base.attributes)) if (!['position', 'bindPos', 'normal'].includes(k)) base.deleteAttribute(k);
  const out = mergeGeometries([base, extra]);
  base.dispose();
  extra.dispose();
  return out;
}

/**
 * Everyone on campus.
 * - assembly: the teachers who lead the assembly (posed)
 * - crowd: the student body (instanced, baked animation frames)
 * - pool: animated people who walk routes, wait, run, and leave — driven by the school-day simulation
 * - posed: people sitting or standing still at fixed places (desks, the staff room, the library)
 */
export async function createPeople(scene, L, rng, P, camera) {
  const gltf = await L.model('xbot.glb');
  const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  for (const m of skinnedParts(gltf.scene)) m.geometry.setAttribute('bindPos', m.geometry.attributes.position.clone());
  const mats = Object.fromEntries(Object.keys(PALETTES).map((k) => [k, uniformMaterial(k)]));

  // ---------- teachers who lead the assembly (posed) ----------
  const idleBody = bakePose(gltf, clips.idle, 1.4, { surfaceOnly: true });
  const leaders = new THREE.Group();
  const leaderGeo = { teacher: dressed(idleBody.geo, idleBody.joints, 'teacher', P.peopleLod), teacherF: dressed(idleBody.geo, idleBody.joints, 'teacherF', P.peopleLod) };
  for (const [x, z, kind, ry] of [[-24.6, -5, 'teacherF', Math.PI / 2], [24.6, -5, 'teacher', -Math.PI / 2], [2.4, -10.6, 'teacherF2', 0], [-2.6, -10.4, 'teacher3', 0]]) {
    const t = new THREE.Mesh(leaderGeo[PALETTES[kind].saree ? 'teacherF' : 'teacher'], mats[kind]);
    t.position.set(x, 0.08, z);
    t.rotation.y = ry;
    t.castShadow = true;
    leaders.add(t);
  }
  leaders.visible = false;
  scene.add(leaders);
  const assembly = {
    setLeaders(on) {
      leaders.visible = on;
    },
  };

  // ---------- baked bodies: every frame of walking, running, standing, talking, sitting ----------
  const bake = (clip, t, rot) => bakePose(gltf, clip, t, { surfaceOnly: true, rot });
  const raw = [];
  for (let i = 0; i < WALK_FRAMES; i++) raw.push(bake(clips.walk, (i / WALK_FRAMES) * clips.walk.duration));
  for (let i = 0; i < RUN_FRAMES; i++) raw.push(bake(clips.run, (i / RUN_FRAMES) * clips.run.duration));
  raw.push(idleBody);
  for (const name of ['agree', 'headShake']) for (let i = 0; i < TALK_FRAMES; i++) raw.push(bake(clips[name], ((i + 0.5) / TALK_FRAMES) * clips[name].duration));
  const SIT_BODY = bake(clips.idle, 0.6, SIT);
  const IDLE = WALK_FRAMES + RUN_FRAMES;
  const TALK = IDLE + 1;
  const lods = [P.crowdLod, P.crowdFar];

  // ---------- the student body ----------
  const N = P.students;
  const crowdKinds = ['boy', 'girl'];
  // [kind][lod][frame] -> geometry
  const frameGeo = crowdKinds.map((k) => lods.map((ratio) => raw.map((b) => dressed(b.geo, b.joints, k, ratio))));
  const capOf = (lod, f) => {
    if (f === IDLE) return lod === 0 ? Math.ceil(N * 0.5) : N;
    if (f >= TALK) return lod === 0 ? Math.ceil(N * 0.12) : Math.ceil(N * 0.22);
    return lod === 0 ? Math.ceil(N * 0.3) : Math.ceil(N * 0.5);
  };
  const instanced = (geo, mat, cap, shadows) => {
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.setColorAt(0, new THREE.Color(1, 1, 1));
    im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.visible = false;
    im.frustumCulled = false; // people move every frame; culling is done per person below
    im.castShadow = shadows;
    im.receiveShadow = shadows;
    im.userData.cap = cap;
    scene.add(im);
    return im;
  };
  const meshes = crowdKinds.map((k, ki) => frameGeo[ki].map((list, lod) => list.map((g, f) => instanced(g, mats[k], capOf(lod, f), lod === 0))));
  const allMeshes = meshes.flat(2);

  // school bags: a pack with a front pocket, worn on the back
  const bagGeo = mergeGeometries([new THREE.BoxGeometry(0.25, 0.36, 0.13).translate(0, 0, -0.085), new THREE.BoxGeometry(0.19, 0.15, 0.05).translate(0, -0.07, -0.17), new THREE.BoxGeometry(0.1, 0.03, 0.03).translate(0, 0.195, -0.08)]);
  const bags = new THREE.InstancedMesh(bagGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }), N);
  bags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bags.setColorAt(0, new THREE.Color(1, 1, 1));
  bags.count = 0;
  bags.frustumCulled = false;
  bags.castShadow = true;
  scene.add(bags);
  const BAG_COLORS = ['#1d2f5a', '#6e1f2b', '#222222', '#24476b', '#b0365a', '#2f5d3a', '#5a3b8c', '#c4581f', '#3a3a3a', '#0f5b78'].map((c) => new THREE.Color(c));

  // soft round shadows under far-away people (they don't cast real ones)
  const blobTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const blobs = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.85, 0.85).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }),
    N
  );
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobs.count = 0;
  blobs.frustumCulled = false;
  blobs.renderOrder = 1;
  scene.add(blobs);

  const crowdAgents = [];
  for (let i = 0; i < N; i++) {
    crowdAgents.push({
      i, teacher: false, kind: crowdKinds[i % 2], size: 0.78 + rng() * 0.14, tone: 0.84 + rng() * 0.16,
      bagColor: BAG_COLORS[Math.floor(rng() * BAG_COLORS.length)], bag: false,
      off: new THREE.Vector3((rng() - 0.5) * 1.5, 0, (rng() - 0.5) * 1.5),
      active: false, path: null, seg: 0, run: false, pace: 1, wait: 0, onArrive: null, holdT: 0, y0: 0, segLen: -1,
      pos: new THREE.Vector3(), heading: 0, face: null, tag: null, anim: rng(), data: null, talk: false, talkSet: i % 2,
    });
  }
  // idle students, one stack per kind (so whoever stands up from a girl's seat is a girl)
  const free = { boy: [], girl: [] };
  for (let i = N - 1; i >= 0; i--) free[crowdAgents[i].kind].push(crowdAgents[i]);
  let activeCount = 0;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const bagOff = new THREE.Vector3();
  const bagPos = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
  const near2 = P.lodRadius * P.lodRadius;
  const tmpC = new THREE.Vector3();
  const flush = (im) => {
    im.visible = im.count > 0;
    if (!im.visible) return;
    im.instanceMatrix.clearUpdateRanges();
    im.instanceMatrix.addUpdateRange(0, im.count * 16);
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) {
      im.instanceColor.clearUpdateRanges();
      im.instanceColor.addUpdateRange(0, im.count * 3);
      im.instanceColor.needsUpdate = true;
    }
  };
  const updateFrustum = () => {
    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
  };

  const crowd = {
    agents: crowdAgents,
    get capacity() {
      return N;
    },
    activeCount: () => activeCount,
    freeCount: () => free.boy.length + free.girl.length,
    /** a student enters the scene; returns null when everyone is already out. opts.kind prefers boys or girls */
    spawn(points, opts = {}) {
      const pref = opts.kind || (free.boy.length > free.girl.length ? 'boy' : 'girl');
      const a = free[pref].pop() || free[pref === 'boy' ? 'girl' : 'boy'].pop();
      if (!a) return null;
      a.active = true;
      activeCount++;
      a.sys = this;
      a.tag = opts.tag || null;
      a.bag = Boolean(opts.bag);
      a.data = opts.data ?? null;
      if (opts.size) a.size = opts.size;
      if (opts.tone) a.tone = opts.tone;
      a.pos.copy(points[0]);
      if (opts.jitterStart !== false && !opts.lateral) a.pos.add(a.off);
      if (opts.lateral && points[1]) {
        const dx = points[1].x - points[0].x;
        const dz = points[1].z - points[0].z;
        const l = Math.hypot(dx, dz) || 1;
        a.pos.x += (dz / l) * opts.lateral;
        a.pos.z += (-dx / l) * opts.lateral;
      }
      a.heading = points[1] ? Math.atan2(points[1].x - points[0].x, points[1].z - points[0].z) : (opts.face ?? 0);
      this.route(a, points.slice(1), opts);
      return a;
    },
    route(a, points, opts = {}) {
      setRoute(a, points, opts);
    },
    release(a) {
      if (!a.active) return;
      a.active = false;
      a.tag = null;
      a.data = null;
      a.onArrive = null;
      a.talk = false;
      a.holdT = 0;
      activeCount--;
      free[a.kind].push(a);
    },
    releaseAll(filter = () => true) {
      for (const a of crowdAgents) if (a.active && filter(a)) this.release(a);
    },
    update(dt) {
      for (const im of allMeshes) im.count = 0;
      let nb = 0;
      let nblob = 0;
      updateFrustum();
      const cam = camera.position;
      for (let i = 0; i < N; i++) {
        const a = crowdAgents[i];
        if (!a.active) continue;
        const moving = step(a, dt, tmpC);
        if (!a.active) continue;
        let f = IDLE;
        if (moving) {
          a.anim = (a.anim + (dt / (a.run ? clips.run.duration : clips.walk.duration)) * (a.run ? 1 : a.pace)) % 1;
          f = a.run ? WALK_FRAMES + Math.floor(a.anim * RUN_FRAMES) : Math.floor(a.anim * WALK_FRAMES);
        } else if (a.talk) {
          // chatting with friends: nodding and shaking heads, at their own pace
          a.anim = (a.anim + dt * 0.45) % 1;
          const ph = a.anim * 2;
          f = ph < 1 ? TALK + a.talkSet * TALK_FRAMES + Math.min(TALK_FRAMES - 1, Math.floor(ph * TALK_FRAMES)) : IDLE;
        }
        // only students in view are drawn
        sphere.center.set(a.pos.x, a.pos.y + 0.9, a.pos.z);
        if (!frustum.intersectsSphere(sphere)) continue;
        const dx = a.pos.x - cam.x;
        const dy = a.pos.y - cam.y;
        const dz = a.pos.z - cam.z;
        const lod = dx * dx + dy * dy + dz * dz < near2 ? 0 : 1;
        const im = meshes[a.kind === 'boy' ? 0 : 1][lod][f];
        if (im.count >= im.userData.cap) continue;
        q.setFromAxisAngle(up, a.heading);
        sc.setScalar(a.size);
        m4.compose(a.pos, q, sc);
        im.setMatrixAt(im.count, m4);
        im.setColorAt(im.count, col.setScalar(a.tone));
        im.count++;
        if (a.bag) {
          bagOff.set(0, 1.13 * a.size, -0.13 * a.size).applyQuaternion(q);
          bagPos.copy(a.pos).add(bagOff);
          m4.compose(bagPos, q, sc);
          bags.setMatrixAt(nb, m4);
          bags.setColorAt(nb, a.bagColor);
          nb++;
        }
        if (lod === 1) {
          m4.makeTranslation(a.pos.x, a.pos.y + 0.02, a.pos.z);
          blobs.setMatrixAt(nblob++, m4);
        }
      }
      for (const im of allMeshes) flush(im);
      bags.count = nb;
      flush(bags);
      blobs.count = nblob;
      flush(blobs);
    },
  };

  // ---------- people sitting (or standing to teach) at fixed places ----------
  // students at desks and readers: boys and girls, two levels of detail
  const sitGeo = crowdKinds.map((k) => lods.map((r) => dressed(SIT_BODY.geo, SIT_BODY.joints, k, r)));
  // teachers: sitting, and standing at the board talking (nodding frames)
  const TEACH_FRAMES = [raw[TALK], raw[TALK + 1], raw[TALK + 2], idleBody];
  const tLods = [Math.max(P.crowdLod, 0.12), P.crowdFar * 1.6];
  const teacherGeo = {};
  for (const sex of ['m', 'f']) {
    const k = sex === 'm' ? 'teacher' : 'teacherF';
    teacherGeo[sex] = tLods.map((r) => ({ sit: dressed(SIT_BODY.geo, SIT_BODY.joints, k, r), talk: TEACH_FRAMES.map((b) => dressed(b.geo, b.joints, k, r)) }));
  }
  raw.forEach((b) => b.geo.dispose());
  const posedMeshes = new Map();
  const posedCap = { boy: Math.ceil(N * 0.62) + 40, girl: Math.ceil(N * 0.62) + 40 };
  const pm = (key, geo, mat, cap) => {
    const im = instanced(geo, mat, cap, false);
    im.receiveShadow = true;
    posedMeshes.set(key, im);
    return im;
  };
  crowdKinds.forEach((k, ki) => lods.forEach((_, lod) => pm(`${k}|sit|${lod}`, sitGeo[ki][lod], mats[k], posedCap[k])));
  for (const k of [...MALE_TEACHERS, ...FEMALE_TEACHERS]) {
    const sex = PALETTES[k].saree ? 'f' : 'm';
    tLods.forEach((_, lod) => {
      pm(`${k}|sit|${lod}`, teacherGeo[sex][lod].sit, mats[k], 12);
      teacherGeo[sex][lod].talk.forEach((g, f) => pm(`${k}|talk${f}|${lod}`, g, mats[k], 24));
    });
  }
  const posedAll = [...posedMeshes.values()];
  const groups = [];
  const posed = {
    /** a place where people sit together (a classroom, the staff room); culled as one */
    group(x, y, z, r = 5.5) {
      const g = { c: new THREE.Vector3(x, y, z), r, slots: [], on: 0 };
      groups.push(g);
      return g;
    },
    /** one seat (or teaching spot) in a group */
    slot(g, { kind, pose = 'sit', x, y, z, heading = 0, size = 1, tone = 1 }) {
      const s = { g, kind, pose, x, y, z, heading, size, tone, on: false, phase: Math.random() * 10 };
      g.slots.push(s);
      return s;
    },
    set(s, on) {
      if (s.on === on) return;
      s.on = on;
      s.g.on += on ? 1 : -1;
    },
    update(elapsed) {
      updateFrustum();
      for (const im of posedAll) im.count = 0;
      const cam = camera.position;
      const gs = new THREE.Sphere();
      const p = new THREE.Vector3();
      for (const g of groups) {
        if (!g.on) continue;
        gs.set(g.c, g.r);
        if (!frustum.intersectsSphere(gs)) continue;
        const d2 = g.c.distanceToSquared(cam);
        if (d2 > 80 * 80) continue; // too far to see in through the windows
        for (const s of g.slots) {
          if (!s.on) continue;
          const lod = p.set(s.x, s.y, s.z).distanceToSquared(cam) < near2 * 1.6 ? 0 : 1;
          let key;
          if (s.pose === 'talk') {
            // a teacher explaining: nods now and then, otherwise stands
            const t = (elapsed * 0.5 + s.phase) % 4;
            key = `${s.kind}|talk${t < 1.5 ? Math.floor(t * 2) % 3 : 3}|${lod}`;
          } else key = `${s.kind}|sit|${lod}`;
          const im = posedMeshes.get(key);
          if (!im || im.count >= im.userData.cap) continue;
          q.setFromAxisAngle(up, s.heading);
          sc.setScalar(s.size);
          m4.compose(p, q, sc);
          im.setMatrixAt(im.count, m4);
          im.setColorAt(im.count, col.setScalar(s.tone));
          im.count++;
        }
      }
      for (const im of posedAll) flush(im);
    },
  };

  // ---------- the pool of animated people ----------
  // lighter meshes for walkers (the clones below share these geometries)
  for (const m of skinnedParts(gltf.scene)) simplifyGeometry(m.geometry, P.peopleLod);
  const kinds = ['boy', 'girl', 'boy2', 'girl', 'boy', 'boy2', 'girl'];
  const agents = [];
  const teacherEvery = 7;
  let nT = 0;
  for (let i = 0; i < P.walkers; i++) {
    const teacher = [1, 3, 5].includes(i % teacherEvery); // about three in seven are teachers
    const kind = teacher ? (nT++ % 2 ? MALE_TEACHERS : FEMALE_TEACHERS)[Math.floor(nT / 2) % 3] : kinds[i % kinds.length];
    const obj = cloneSkinned(gltf.scene);
    obj.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material = mats[kind];
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    const holder = new THREE.Group();
    holder.add(obj);
    holder.visible = false;
    const size = teacher ? 0.97 + rng() * 0.05 : 0.78 + rng() * 0.12;
    holder.scale.setScalar(size);
    scene.add(holder);
    const mixer = new THREE.AnimationMixer(obj);
    const act = { walk: mixer.clipAction(clips.walk), run: mixer.clipAction(clips.run), idle: mixer.clipAction(clips.idle) };
    for (const a of Object.values(act)) {
      a.play();
      a.weight = 0;
    }
    act.idle.weight = 1;
    mixer.setTime(rng() * 5);
    const ag = {
      i, teacher, kind, holder, mixer, act, size, off: null,
      active: false, path: null, seg: 0, run: false, wait: 0, onArrive: null, onWaitEnd: null, holdT: 0, y0: 0, segLen: -1,
      pos: new THREE.Vector3(), heading: 0, face: null, tag: null,
      w: { walk: 0, run: 0, idle: 1 },
    };
    if (PALETTES[kind].saree) ag.saree = makeLiveSaree(obj, kind, holder);
    agents.push(ag);
  }

  const tmp = new THREE.Vector3();
  const pool = {
    agents,
    activeCount() {
      return agents.reduce((n, a) => n + (a.active ? 1 : 0), 0);
    },
    /**
     * Sends someone on a route. Returns the agent, or null when everyone is busy.
     * opts: { teacher, run, tag, onArrive(agent), wait, face, pace (walking speed, 1 = normal) }
     */
    spawn(points, opts = {}) {
      const a = agents.find((g) => !g.active && (opts.teacher === undefined || g.teacher === opts.teacher));
      if (!a) return null;
      a.active = true;
      a.sys = this;
      a.holder.visible = true;
      if (a.saree) a.saree.mesh.visible = true;
      a.tag = opts.tag || null;
      a.pos.copy(points[0]);
      a.heading = points[1] ? Math.atan2(points[1].x - points[0].x, points[1].z - points[0].z) : 0;
      this.route(a, points.slice(1), opts);
      return a;
    },
    /** gives an agent a new route (or a wait if the route is empty) */
    route(a, points, opts = {}) {
      setRoute(a, points, opts);
      a.act.walk.timeScale = a.pace;
    },
    release(a) {
      a.active = false;
      a.holder.visible = false;
      if (a.saree) a.saree.mesh.visible = false;
      a.tag = null;
    },
    releaseAll(filter = () => true) {
      for (const a of agents) if (a.active && filter(a)) this.release(a);
    },
    update(dt) {
      for (const a of agents) {
        if (!a.active) continue;
        const moving = step(a, dt, tmp);
        if (!a.active) continue;
        // blend walk / run / idle smoothly
        const tw = moving && !a.run ? 1 : 0;
        const tr = moving && a.run ? 1 : 0;
        const ti = moving ? 0 : 1;
        const k = Math.min(1, dt * 6);
        a.w.walk += (tw - a.w.walk) * k;
        a.w.run += (tr - a.w.run) * k;
        a.w.idle += (ti - a.w.idle) * k;
        a.act.walk.weight = a.w.walk;
        a.act.run.weight = a.w.run;
        a.act.idle.weight = a.w.idle;
        a.holder.position.copy(a.pos);
        a.holder.rotation.y = a.heading;
        a.mixer.update(dt);
        if (a.saree) {
          a.holder.updateMatrixWorld(true);
          a.saree.update();
        }
      }
    },
  };

  return { assembly, pool, crowd, posed, updateFrustum };
}

/** an animated teacher's saree, rebuilt every frame around her moving legs (lives in her holder's frame) */
function makeLiveSaree(obj, kind, holder) {
  const P = PALETTES[kind];
  const colorOf = { saree: new THREE.Color(P.pants), border: new THREE.Color(P.belt), hair: new THREE.Color(P.hair), skirt: new THREE.Color(P.pants), ribbon: new THREE.Color('#ffffff') };
  const build = () => {
    const S = new Shapes();
    sareeClothes(S, jointsOf(obj, holder), 16);
    return S;
  };
  holder.updateMatrixWorld(true);
  const S0 = build();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(S0.pos, 3));
  const colors = new Float32Array(S0.role.length * 3);
  S0.role.forEach((r, i) => colorOf[r].toArray(colors, i * 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(S0.idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  holder.add(mesh);
  return {
    mesh,
    update() {
      const S = build();
      g.attributes.position.array.set(S.pos);
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    },
  };
}
