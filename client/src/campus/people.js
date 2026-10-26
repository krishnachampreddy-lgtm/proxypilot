import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FL } from './school.js';

/*
  Students and teachers.
  An animated human figure (walk / run / idle) is dressed in school uniform by a shader
  that paints each body region from its rest-pose position: shirt, tie, belt, trousers or
  pinafore, socks, shoes, skin and hair. Walkers are fully animated; the morning assembly
  uses posed copies drawn with instancing so dozens of students cost almost nothing.
*/

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

export async function buildPeople(scene, L, rng, { quality = 'high' }) {
  const gltf = await L.model('xbot.glb');
  const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  for (const m of skinnedParts(gltf.scene)) {
    m.geometry.setAttribute('bindPos', m.geometry.attributes.position.clone());
  }
  const mats = Object.fromEntries(Object.keys(PALETTES).map((k) => [k, uniformMaterial(k)]));

  // ---------- morning assembly: rows of students facing the porch ----------
  const assembly = new THREE.Group();
  const pose = bakePose(gltf, clips.idle, 0.6, { surfaceOnly: true });
  const rows = quality === 'high' || quality === 'still' ? 6 : 4;
  const cols = quality === 'low' ? 5 : 8;
  const boys = [];
  const girls = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = -(cols - 1) * 2 + c * 4 + (r % 2) * 0.1 + (rng() - 0.5) * 0.15;
      const z = -7.5 + r * 1.35 + (rng() - 0.5) * 0.12;
      // each class line has a boys' file and a girls' file
      (rng() < 0.5 ? boys : girls).push([x + (rng() < 0.5 ? -0.55 : 0.55), z]);
    }
  }
  const instanced = (spots, mat) => {
    const im = new THREE.InstancedMesh(pose, mat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([x, z], i) => {
      const s = 0.8 + rng() * 0.1;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI + (rng() - 0.5) * 0.12);
      m4.compose(new THREE.Vector3(x, 0.08, z), q, new THREE.Vector3(s, s, s));
      im.setMatrixAt(i, m4);
      im.setColorAt(i, new THREE.Color().setScalar(0.92 + rng() * 0.08));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
  };
  assembly.add(instanced(boys, mats.boy), instanced(girls, mats.girl));
  // teachers standing with the class lines, and one at the flag
  const tPose = bakePose(gltf, clips.idle, 1.4);
  const tSpots = [[-19, -4, mats.teacherF], [19, -4, mats.teacher], [2.2, -10.5, mats.teacherF]];
  for (const [x, z, mat] of tSpots) {
    const t = new THREE.Mesh(tPose, mat);
    t.position.set(x, 0.08, z);
    t.rotation.y = x > 5 ? -Math.PI / 2 : x < -5 ? Math.PI / 2 : 0;
    t.castShadow = true;
    assembly.add(t);
  }
  scene.add(assembly);

  // ---------- walkers ----------
  const P = (pts, y = 0.08) => pts.map(([x, z]) => new THREE.Vector3(x, y, z));
  const PATHS = {
    yard: P([[-24, -13.6], [24, -13.6], [24, 6], [-24, 6]]),
    gate: P([[1.5, 43], [1.5, 9], [-1.5, 9], [-1.5, 43]]),
    library: P([[-6, 12.5], [-46, 12.5], [-46, -34], [-44.5, -34], [-44.5, 11], [-6, 11]]),
    bus: P([[8, 12.5], [22, 12.5], [22, 20.5], [40, 20.5], [40, 22], [8, 14]]),
    track: (() => {
      // lane 2 of the running track: two straights joined by half circles
      const out = [];
      const cx = 85, cz = -30, r = 17.2, half = 22;
      for (let i = 0; i <= 12; i++) out.push(new THREE.Vector3(cx + r, 0.1, cz + half - (2 * half * i) / 12));
      for (let i = 1; i < 16; i++) { const a = (i / 16) * Math.PI; out.push(new THREE.Vector3(cx + Math.cos(a) * r, 0.1, cz - half - Math.sin(a) * r)); }
      for (let i = 0; i <= 12; i++) out.push(new THREE.Vector3(cx - r, 0.1, cz - half + (2 * half * i) / 12));
      for (let i = 1; i < 16; i++) { const a = Math.PI + (i / 16) * Math.PI; out.push(new THREE.Vector3(cx + Math.cos(a) * r, 0.1, cz + half - Math.sin(a) * r)); }
      return out;
    })(),
    field: P([[76, -50], [94, -44], [90, -14], [78, -20]]),
    corridor1: P([[5.5, -26.2], [27.5, -26.2]], FL[1] + 0.03),
    corridor2: P([[-28.2, -22], [-28.2, 6]], FL[2] + 0.03),
    home: P([[1.5, 9], [1.5, 44.6], [80, 44.6], [80, 44.9], [-1.5, 44.9], [-1.5, 9]]),
  };
  const n = quality === 'high' || quality === 'still' ? 22 : quality === 'medium' ? 12 : 7;
  const morning = ['yard', 'gate', 'library', 'bus', 'track', 'track', 'field', 'corridor1', 'corridor2', 'yard', 'gate', 'library'];
  const evening = ['gate', 'home', 'bus', 'home', 'track', 'gate', 'field', 'corridor1', 'bus', 'home', 'gate', 'corridor2'];
  const kinds = ['boy', 'girl', 'boy2', 'girl', 'boy', 'boy2', 'girl'];
  const walkers = [];
  for (let i = 0; i < n; i++) {
    const isTeacher = i % 9 === 4;
    const kind = isTeacher ? (i % 2 ? 'teacher' : 'teacherF') : kinds[i % kinds.length];
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
    const s = isTeacher ? 0.97 + rng() * 0.05 : 0.8 + rng() * 0.1;
    holder.scale.setScalar(s);
    scene.add(holder);
    const mixer = new THREE.AnimationMixer(obj);
    const walk = mixer.clipAction(clips.walk);
    const run = mixer.clipAction(clips.run);
    walk.play();
    run.play();
    const w = {
      holder,
      mixer,
      walk,
      run,
      scale: s,
      paths: [morning[i % morning.length], evening[i % evening.length]],
      seg: 0,
      cur: null,
      pos: new THREE.Vector3(),
      heading: 0,
      phase: rng() * 10,
    };
    const path = PATHS[w.paths[0]];
    const start = Math.floor(rng() * path.length);
    w.pos.copy(path[start]).lerp(path[(start + 1) % path.length], rng());
    w.seg = (start + 1) % path.length;
    w.cur = w.paths[0];
    mixer.setTime(w.phase);
    walkers.push(w);
  }

  const tmp = new THREE.Vector3();
  return {
    assembly,
    update(dt, k) {
      assembly.visible = k < 0.5;
      const which = k < 0.5 ? 0 : 1;
      for (const w of walkers) {
        const name = w.paths[which];
        const path = PATHS[name];
        if (w.cur !== name) {
          // join the new route at its nearest point
          let best = 0;
          let bd = Infinity;
          path.forEach((p, j) => {
            const d = p.distanceToSquared(w.pos);
            if (d < bd) (bd = d), (best = j);
          });
          w.cur = name;
          w.seg = best;
          if (path[best].y !== w.pos.y) w.pos.copy(path[best]);
        }
        const running = name === 'track';
        const speed = (running ? 3.1 : 1.15) * w.scale;
        w.walk.weight = running ? 0 : 1;
        w.run.weight = running ? 1 : 0;
        const goal = path[w.seg];
        tmp.subVectors(goal, w.pos);
        tmp.y = 0;
        const d = tmp.length();
        if (d < 0.3) {
          w.seg = (w.seg + 1) % path.length;
        } else {
          const step = Math.min(d, speed * dt);
          w.pos.addScaledVector(tmp.normalize(), step);
          w.pos.y = goal.y;
          const want = Math.atan2(tmp.x, tmp.z);
          let diff = want - w.heading;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          w.heading += diff * Math.min(1, dt * 6);
        }
        w.holder.position.copy(w.pos);
        w.holder.rotation.y = w.heading;
        w.mixer.update(dt * (running ? 1 : 0.95));
      }
    },
  };
}
