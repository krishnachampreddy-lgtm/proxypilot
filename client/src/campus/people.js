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
  - the student body — a thousand and more, streaming in with school bags, standing in
    assembly, going home — uses frames of the walk and run cycles baked into plain meshes
    and drawn with instancing, in two levels of detail (students far from the camera use
    a much lighter mesh and a soft blob shadow), and only the ones in view are drawn
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
export async function createPeople(scene, L, rng, P, camera) {
  const gltf = await L.model('xbot.glb');
  const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  for (const m of skinnedParts(gltf.scene)) m.geometry.setAttribute('bindPos', m.geometry.attributes.position.clone());
  const mats = Object.fromEntries(Object.keys(PALETTES).map((k) => [k, uniformMaterial(k)]));

  // ---------- teachers who lead the assembly (posed) ----------
  const tPose = simplifyGeometry(bakePose(gltf, clips.idle, 1.4), P.peopleLod);
  const leaders = new THREE.Group();
  for (const [x, z, mat, ry] of [[-24.6, -5, mats.teacherF, Math.PI / 2], [24.6, -5, mats.teacher, -Math.PI / 2], [2.4, -10.6, mats.teacherF, 0], [-2.6, -10.4, mats.teacher, 0]]) {
    const t = new THREE.Mesh(tPose, mat);
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

  // ---------- the student body ----------
  // every frame of the walk and run cycles, baked once, then lightened twice:
  // a detailed version for students near the camera and a very light one for the rest
  const lods = [P.crowdLod, P.crowdFar];
  const bake = (clip, t) => bakePose(gltf, clip, t, { surfaceOnly: true });
  const raw = [];
  for (let i = 0; i < WALK_FRAMES; i++) raw.push(bake(clips.walk, (i / WALK_FRAMES) * clips.walk.duration));
  for (let i = 0; i < RUN_FRAMES; i++) raw.push(bake(clips.run, (i / RUN_FRAMES) * clips.run.duration));
  raw.push(bake(clips.idle, 0.6));
  const IDLE = WALK_FRAMES + RUN_FRAMES;
  const frameGeo = lods.map((ratio) => raw.map((g) => compactGeometry(simplifyGeometry(g.clone(), ratio, 0.2))));
  raw.forEach((g) => g.dispose());

  const N = P.students;
  const crowdKinds = ['boy', 'girl'];
  // [kind][lod][frame] -> InstancedMesh
  const meshes = crowdKinds.map((k) =>
    frameGeo.map((list, lod) =>
      list.map((g, f) => {
        const cap = lod === 0 ? (f === IDLE ? Math.ceil(N * 0.5) : Math.ceil(N * 0.3)) : f === IDLE ? N : Math.ceil(N * 0.5);
        const im = new THREE.InstancedMesh(g, mats[k], cap);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.setColorAt(0, new THREE.Color(1, 1, 1));
        im.instanceColor.setUsage(THREE.DynamicDrawUsage);
        im.count = 0;
        im.visible = false;
        im.frustumCulled = false; // students move every frame; culling is done per student below
        im.castShadow = lod === 0;
        im.receiveShadow = lod === 0;
        im.userData.cap = cap;
        scene.add(im);
        return im;
      })
    )
  );
  const allMeshes = meshes.flat(2);

  // school bags: a pack with a front pocket, worn on the back
  const bagGeo = mergeGeometries([new THREE.BoxGeometry(0.3, 0.38, 0.13).translate(0, 0, -0.065), new THREE.BoxGeometry(0.22, 0.16, 0.05).translate(0, -0.07, -0.15), new THREE.BoxGeometry(0.1, 0.03, 0.03).translate(0, 0.205, -0.06)]);
  const bags = new THREE.InstancedMesh(bagGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }), N);
  bags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bags.setColorAt(0, new THREE.Color(1, 1, 1));
  bags.count = 0;
  bags.frustumCulled = false;
  bags.castShadow = true;
  scene.add(bags);
  const BAG_COLORS = ['#1d2f5a', '#6e1f2b', '#222222', '#24476b', '#b0365a', '#2f5d3a', '#5a3b8c', '#c4581f', '#3a3a3a', '#0f5b78'].map((c) => new THREE.Color(c));

  // soft round shadows under far-away students (they don't cast real ones)
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
      active: false, path: null, seg: 0, run: false, pace: 1, wait: 0, onArrive: null,
      pos: new THREE.Vector3(), heading: 0, face: null, tag: null, anim: rng(), data: null,
    });
  }
  const free = crowdAgents.slice().reverse(); // a stack of idle students
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

  const crowd = {
    agents: crowdAgents,
    get capacity() {
      return N;
    },
    activeCount: () => activeCount,
    freeCount: () => free.length,
    /** a student enters the scene; returns null when everyone is already out */
    spawn(points, opts = {}) {
      const a = free.pop();
      if (!a) return null;
      a.active = true;
      activeCount++;
      a.sys = this;
      a.tag = opts.tag || null;
      a.bag = Boolean(opts.bag);
      a.data = opts.data ?? null;
      a.pos.copy(points[0]);
      if (opts.jitterStart !== false) a.pos.add(a.off);
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
      activeCount--;
      free.push(a);
    },
    releaseAll(filter = () => true) {
      for (const a of crowdAgents) if (a.active && filter(a)) this.release(a);
    },
    update(dt) {
      for (const im of allMeshes) im.count = 0;
      let nb = 0;
      let nblob = 0;
      camera.updateMatrixWorld();
      projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projView);
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
      for (const im of allMeshes) {
        im.visible = im.count > 0;
        if (im.visible) {
          im.instanceMatrix.clearUpdateRanges();
          im.instanceMatrix.addUpdateRange(0, im.count * 16);
          im.instanceMatrix.needsUpdate = true;
          im.instanceColor.clearUpdateRanges();
          im.instanceColor.addUpdateRange(0, im.count * 3);
          im.instanceColor.needsUpdate = true;
        }
      }
      bags.count = nb;
      bags.visible = nb > 0;
      if (nb) {
        bags.instanceMatrix.clearUpdateRanges();
        bags.instanceMatrix.addUpdateRange(0, nb * 16);
        bags.instanceMatrix.needsUpdate = true;
        bags.instanceColor.clearUpdateRanges();
        bags.instanceColor.addUpdateRange(0, nb * 3);
        bags.instanceColor.needsUpdate = true;
      }
      blobs.count = nblob;
      blobs.visible = nblob > 0;
      if (nblob) {
        blobs.instanceMatrix.clearUpdateRanges();
        blobs.instanceMatrix.addUpdateRange(0, nblob * 16);
        blobs.instanceMatrix.needsUpdate = true;
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
    const teacher = [1, 3, 5].includes(i % teacherEvery); // about three in seven are teachers
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
