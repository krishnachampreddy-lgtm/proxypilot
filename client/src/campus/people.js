import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { simplifyGeometry, compactGeometry } from './lod.js';

/*
  Students and teachers.
  An animated human figure (walk / run / idle) is dressed in school uniform by a shader
  that paints each body region from its rest-pose position: shirt, tie, belt, trousers or
  pinafore, socks, shoes, skin and hair.
  - teachers and the students in games are fully animated (skinned, with blended walk/run/idle)
  - the crowd — everyone streaming in, out and around — uses frames of the walk and run
    cycles baked into plain meshes and drawn with instancing, so a hundred-plus students
    walk at once for the cost of a few draw calls
  - the morning assembly is posed copies, also instanced
*/

const WALK_FRAMES = 8;
const RUN_FRAMES = 6;

/** moves one person along their route; returns true while they're walking */
function step(a, dt, tmp) {
  if (a.path && a.seg < a.path.length) {
    const goal = a.path[a.seg];
    tmp.subVectors(goal, a.pos);
    tmp.y = 0;
    const d = tmp.length();
    const speed = (a.run ? 3.0 : 1.2 * (a.pace || 1)) * a.size;
    if (d < 0.25) {
      a.pos.y = goal.y;
      a.seg++;
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
    a.pos.addScaledVector(tmp.normalize(), Math.min(d, speed * dt));
    a.pos.y = goal.y;
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

/** shared route bookkeeping for both kinds of people */
function setRoute(a, points, { run = false, onArrive = null, wait = 0, face = null, pace = 1 } = {}) {
  a.path = points.map((p) => p.clone());
  if (a.off && a.path.length > 1) {
    for (let i = 0; i < a.path.length - 1; i++) {
      a.path[i].x += a.off.x;
      a.path[i].z += a.off.z;
    }
  }
  a.seg = 0;
  a.run = run;
  a.pace = pace;
  a.onArrive = onArrive;
  a.wait = points.length ? 0 : wait;
  a.waitAfter = wait;
  a.face = face;
}

const PALETTES = {
  boy: { shirt: '#f3f2ec', pants: '#26314d', tie: '#7c1f2c', skin: '#9c6a4a', hair: '#15100c', belt: '#151515', socks: '#efefea', shoe: '#0d0d0d', tieOn: 1, girl: 0 },
  boy2: { shirt: '#f3f2ec', pants: '#26314d', tie: '#7c1f2c', skin: '#7f5236', hair: '#120d0a', belt: '#151515', socks: '#efefea', shoe: '#0d0d0d', tieOn: 1, girl: 0 },
  girl: { shirt: '#f3f2ec', pants: '#26314d', tie: '#7c1f2c', skin: '#a8744f', hair: '#120d0a', belt: '#26314d', socks: '#efefea', shoe: '#0d0d0d', tieOn: 1, girl: 1 },
  teacher: { shirt: '#a9c4df', pants: '#2a2b2f', tie: '#a9c4df', skin: '#8a5a3c', hair: '#1a1410', belt: '#111111', socks: '#2a2b2f', shoe: '#2b1a10', tieOn: 0, girl: 0 },
  teacherF: { shirt: '#8d2a4f', pants: '#8d2a4f', tie: '#8d2a4f', skin: '#9a6545', hair: '#100b08', belt: '#c99a3c', socks: '#8d2a4f', shoe: '#3a2414', tieOn: 0, girl: 1 },
};

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
          if (b.y > 1.71) col = u_hair;
          ${P.girl ? 'if (b.y > 1.22 && b.y < 1.66 && b.z < -0.05 && ax < 0.14) col = u_hair;' : ''}
          if (b.y > 0.9 && b.y <= 0.95) col = u_belt;
          if (b.y < 0.16) col = u_socks;
          if (b.y < 0.085) col = u_shoe;
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

/** Freezes the figure in one frame of an animation and returns a plain geometry. */
function bakePose(gltf, clip, time, { surfaceOnly = false } = {}) {
  const copy = cloneSkinned(gltf.scene);
  const mixer = new THREE.AnimationMixer(copy);
  mixer.clipAction(clip).play();
  mixer.update(time);
  copy.updateMatrixWorld(true);
  const geos = [];
  for (const m of skinnedParts(copy)) {
    if (surfaceOnly && m.geometry.attributes.position.count < 14000) continue; // skip the small joint rings far away
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
    g.setIndex(m.geometry.index.clone());
    g.computeVertexNormals();
    geos.push(g);
  }
  return mergeGeometries(geos);
}

/**
 * Everyone on campus.
 * - assembly: rows of students drawn with instancing; `setFill(0..1)` shows how many have arrived
 * - pool: animated people who walk routes, wait, run, and leave — driven by the school-day simulation
 */
export async function createPeople(scene, L, rng, P) {
  const gltf = await L.model('xbot.glb');
  const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  for (const m of skinnedParts(gltf.scene)) m.geometry.setAttribute('bindPos', m.geometry.attributes.position.clone());
  const mats = Object.fromEntries(Object.keys(PALETTES).map((k) => [k, uniformMaterial(k)]));

  // ---------- assembly rows (front row nearest the flag fills first) ----------
  const pose = simplifyGeometry(bakePose(gltf, clips.idle, 0.6, { surfaceOnly: true }), P.crowdLod);
  const rows = P.name === 'low' ? 4 : 6;
  const cols = P.name === 'low' ? 6 : 8;
  const slots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -(cols - 1) * 2 + c * 4 + (rng() - 0.5) * 0.15;
      const z = -7.5 + r * 1.35 + (rng() - 0.5) * 0.12;
      slots.push({ x: x - 0.55, z, girl: false }, { x: x + 0.55, z, girl: true });
    }
  }
  const make = (list, mat) => {
    const im = new THREE.InstancedMesh(pose, mat, list.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    list.forEach((sl, i) => {
      const s = 0.8 + rng() * 0.1;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI + (rng() - 0.5) * 0.14);
      m4.compose(new THREE.Vector3(sl.x, 0.08, sl.z), q, new THREE.Vector3(s, s, s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, new THREE.Color().setScalar(0.92 + rng() * 0.08));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.count = 0;
    scene.add(im);
    return im;
  };
  const boySlots = slots.filter((s) => !s.girl);
  const girlSlots = slots.filter((s) => s.girl);
  const boys = make(boySlots, mats.boy);
  const girls = make(girlSlots, mats.girl);
  // teachers who lead the assembly
  const tPose = simplifyGeometry(bakePose(gltf, clips.idle, 1.4), P.peopleLod);
  const leaders = new THREE.Group();
  for (const [x, z, mat, ry] of [[-19, -4, mats.teacherF, Math.PI / 2], [19, -4, mats.teacher, -Math.PI / 2], [2.2, -10.5, mats.teacherF, 0]]) {
    const t = new THREE.Mesh(tPose, mat);
    t.position.set(x, 0.08, z);
    t.rotation.y = ry;
    t.castShadow = true;
    leaders.add(t);
  }
  leaders.visible = false;
  scene.add(leaders);

  const assembly = {
    slots,
    fill: 0,
    setFill(f) {
      this.fill = Math.max(0, Math.min(1, f));
      boys.count = Math.round(boySlots.length * this.fill);
      girls.count = Math.round(girlSlots.length * this.fill);
    },
    setLeaders(on) {
      leaders.visible = on;
    },
    /** where the next arriving student will stand */
    slotFor(i) {
      return slots[Math.min(slots.length - 1, i)];
    },
  };


  // ---------- the crowd ----------
  // frames of the walk and run cycles, baked once, lightened, then instanced
  const lean = (g) => compactGeometry(simplifyGeometry(g, P.crowdLod));
  const frames = [];
  for (let i = 0; i < WALK_FRAMES; i++) frames.push(lean(bakePose(gltf, clips.walk, (i / WALK_FRAMES) * clips.walk.duration, { surfaceOnly: true })));
  for (let i = 0; i < RUN_FRAMES; i++) frames.push(lean(bakePose(gltf, clips.run, (i / RUN_FRAMES) * clips.run.duration, { surfaceOnly: true })));
  frames.push(pose); // standing
  const IDLE = WALK_FRAMES + RUN_FRAMES;
  const cap = P.crowd;
  const crowdKinds = ['boy', 'girl'];
  const crowdMeshes = {};
  for (const k of crowdKinds) {
    crowdMeshes[k] = frames.map((g) => {
      const im = new THREE.InstancedMesh(g, mats[k], cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.setColorAt(0, new THREE.Color(1, 1, 1));
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.visible = false;
      im.frustumCulled = false; // instances move every frame
      im.castShadow = true;
      im.receiveShadow = true;
      scene.add(im);
      return im;
    });
  }
  const crowdAgents = [];
  for (let i = 0; i < cap; i++) {
    crowdAgents.push({
      i, teacher: false, kind: crowdKinds[i % 2], size: 0.76 + rng() * 0.14, tone: 0.86 + rng() * 0.14,
      off: new THREE.Vector3((rng() - 0.5) * 1.6, 0, (rng() - 0.5) * 1.6),
      active: false, path: null, seg: 0, run: false, pace: 1, wait: 0, onArrive: null,
      pos: new THREE.Vector3(), heading: 0, face: null, tag: null, anim: rng(),
    });
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const crowd = {
    agents: crowdAgents,
    activeCount() {
      return crowdAgents.reduce((n, a) => n + (a.active ? 1 : 0), 0);
    },
    /** same as pool.spawn, for students only; returns null when the crowd is at its limit */
    spawn(points, opts = {}) {
      const a = crowdAgents.find((g) => !g.active);
      if (!a) return null;
      a.active = true;
      a.sys = this;
      a.tag = opts.tag || null;
      a.pos.copy(points[0]).add(a.off);
      a.heading = points[1] ? Math.atan2(points[1].x - points[0].x, points[1].z - points[0].z) : 0;
      this.route(a, points.slice(1), opts);
      return a;
    },
    route(a, points, opts = {}) {
      setRoute(a, points, opts);
    },
    release(a) {
      a.active = false;
      a.tag = null;
    },
    releaseAll(filter = () => true) {
      for (const a of crowdAgents) if (a.active && filter(a)) this.release(a);
    },
    update(dt) {
      for (const k of crowdKinds) for (const im of crowdMeshes[k]) im.count = 0;
      for (const a of crowdAgents) {
        if (!a.active) continue;
        const moving = step(a, dt, tmp);
        if (!a.active) continue;
        let f = IDLE;
        if (moving) {
          a.anim = (a.anim + (dt / (a.run ? clips.run.duration : clips.walk.duration)) * (a.run ? 1 : a.pace)) % 1;
          f = a.run ? WALK_FRAMES + Math.floor(a.anim * RUN_FRAMES) : Math.floor(a.anim * WALK_FRAMES);
        }
        const im = crowdMeshes[a.kind][f];
        q.setFromAxisAngle(up, a.heading);
        m4.compose(a.pos, q, sc.setScalar(a.size));
        im.setMatrixAt(im.count, m4);
        im.setColorAt(im.count, col.setScalar(a.tone));
        im.count++;
      }
      for (const k of crowdKinds) {
        for (const im of crowdMeshes[k]) {
          im.visible = im.count > 0;
          if (im.visible) {
            im.instanceMatrix.needsUpdate = true;
            im.instanceColor.needsUpdate = true;
          }
        }
      }
    },
  };

  // ---------- the pool of animated people ----------
  // lighter meshes for walkers (the clones below share these geometries)
  for (const m of skinnedParts(gltf.scene)) simplifyGeometry(m.geometry, P.peopleLod);
  const kinds = ['boy', 'girl', 'boy2', 'girl', 'boy', 'boy2', 'girl'];
  const agents = [];
  const teacherEvery = 7;
  for (let i = 0; i < P.walkers; i++) {
    const teacher = i % teacherEvery === 3;
    const kind = teacher ? (i % 2 ? 'teacher' : 'teacherF') : kinds[i % kinds.length];
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
    agents.push({
      i, teacher, kind, holder, mixer, act, size, off: null,
      active: false, path: null, seg: 0, run: false, wait: 0, onArrive: null, onWaitEnd: null,
      pos: new THREE.Vector3(), heading: 0, face: null, tag: null,
      w: { walk: 0, run: 0, idle: 1 },
    });
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
      }
    },
  };

  return { assembly, pool, crowd };
}
