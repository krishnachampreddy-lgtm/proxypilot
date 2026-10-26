import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createLoader } from './assets.js';
import { createMaterials } from './materials.js';
import { Batch } from './batch.js';
import { createSky } from './sky.js';
import { createPost } from './post.js';
import { buildSchool, FL } from './school.js';
import { buildGrounds } from './grounds.js';
import { buildTown } from './town.js';
import { buildTrees } from './trees.js';
import { buildVehicles } from './vehicles.js';
import { buildPeople } from './people.js';
import { buildFlag, buildBirds } from './life.js';
import { rng as makeRng, ease, lerp } from './util.js';
import { STOPS } from './stops.js';

/*
  ProxyPilot campus — a realistic Indian school, rendered live in the browser.
  Physically based materials, a real sky that lights the scene, soft sun shadows,
  ambient occlusion, animated students, traffic, birds and trees moving in the wind.
*/

export { STOPS };

const HOME_VIEW = { cam: [96, 40, 112], target: [-22, 2, 2] };
export const STILL_VIEW = { cam: [-58, 24, 66], target: [2, 6, -14] };

export function detectQuality() {
  const q = new URLSearchParams(window.location.search).get('q');
  if (q) return q;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  if (mem <= 3 || cores <= 4) return 'low';
  if (coarse || window.innerWidth < 900) return 'medium';
  return 'high';
}

export function createCampus(container, { mode = 'hero', time = 'morning', quality = detectQuality(), onProgress, onReady, view } = {}) {
  const still = mode === 'still';
  if (still) quality = 'still';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: still || new URLSearchParams(window.location.search).has('pdb'), stencil: false });
  } catch {
    onReady?.(false);
    return null;
  }
  const dpr = { still: 1, high: Math.min(window.devicePixelRatio || 1, 1.5), medium: Math.min(window.devicePixelRatio || 1, 1.25), low: 1 }[quality] ?? 1;
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%', opacity: still ? '1' : '0', transition: still ? 'none' : 'opacity 1.2s ease' });
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.6, 3500);
  const v0 = view || (still ? STILL_VIEW : HOME_VIEW);
  camera.position.set(...v0.cam);
  const target = new THREE.Vector3(...v0.target);
  camera.lookAt(target);

  const rng = makeRng(20261026);
  const L = createLoader(onProgress);
  const M = createMaterials(L, { quality });
  M.glassLit = M.glass.clone();
  M.glassLit.emissive = new THREE.Color('#ffcf8c');
  M.glassLit.emissiveIntensity = 0;
  M.glassStory = M.glass.clone();
  M.glassStory.emissive = new THREE.Color('#ff3b2a');
  M.glassStory.emissiveIntensity = 0;

  const sky = createSky(renderer, scene, { quality: quality === 'still' ? 'high' : quality, flare: !still });

  // ---- static world, merged per material ----
  const B = new Batch(M);
  const school = buildSchool(scene, B, M, rng);
  const grounds = buildGrounds(scene, B, M, L, rng, quality);
  const flag = buildFlag(scene, B, 0, -11);
  B.build(scene, { noCast: ['line', 'tiles', 'pavers', 'asphalt', 'track', 'court', 'courtOut'] });
  const TB = new Batch(M);
  buildTown(TB, M, rng, quality);
  const townMeshes = TB.build(scene);
  if (window.__campusDebug) {
    const tri = (o) => Object.values(o).reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0);
    console.log('town tris', Math.round(tri(townMeshes)));
    console.log('campus tris', Math.round(scene.children.filter((c) => c.isMesh && !Object.values(townMeshes).includes(c)).reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0)));
  }

  const trees = buildTrees(scene, L, rng, { quality, merge: (list) => mergeGeometries(list) });
  const vehicles = buildVehicles(scene, rng);
  const peopleP = buildPeople(scene, L, rng, { quality });
  const birdsP = still ? Promise.resolve(null) : buildBirds(scene, L, rng, { count: quality === 'low' ? 6 : 12 }).catch(() => null); // birds are a nice extra, never a blocker

  // ---- tour beacon ----
  const beacon = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: '#f4c542', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48).rotateX(-Math.PI / 2), ringMat);
  ring.position.y = 0.05;
  const beamMat = new THREE.MeshBasicMaterial({ color: '#f4c542', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 18, 24, 1, true).translate(0, 9, 0), beamMat);
  beacon.add(ring, beam);
  beacon.visible = false;
  scene.add(beacon);

  // ---- finishing ----
  const post = createPost(renderer, scene, camera, { quality });

  // ---- camera control ----
  let controls = null;
  if (mode === 'hero') {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 14;
    controls.maxDistance = 260;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = 1.42;
    controls.rotateSpeed = 0.5;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 0.25;
    if (coarse) {
      controls.enabled = false; // one finger scrolls the page on phones
      renderer.domElement.style.touchAction = 'pan-y';
    }
    controls.update();
  }
  let flight = null;
  const flyTo = (cam, tgt, dur = 2.8) => {
    flight = { fromCam: camera.position.clone(), fromT: (controls ? controls.target : target).clone(), toCam: new THREE.Vector3(...cam), toT: new THREE.Vector3(...tgt), t: 0, dur: reduceMotion ? 0.001 : dur };
    if (controls) controls.autoRotate = false;
  };

  // ---- state ----
  let k = time === 'evening' ? 1 : 0;
  let kTarget = k;
  let people = null;
  let birds = null;
  let ready = false;
  let running = true;
  let visible = true;
  let elapsed = 0;
  let storyClock = 0;
  let forcedStory = false;
  let last = performance.now();
  let envTimer = 0;
  const RED = new THREE.Color('#ff3b2a');
  const YELLOW = new THREE.Color('#f4c542');

  const applyTime = (rebuildEnv = true) => {
    sky.apply(k, { rebuildEnv });
    M.glassLit.emissiveIntensity = k * 0.95;
    M.night.value = k;
    M.lampOff.emissiveIntensity = k * 6;
    school.dialMat.emissiveIntensity = k * 0.5;
    school.setClock(lerp(8 + 50 / 60, 16 + 20 / 60, k));
  };

  const updateStory = () => {
    // classroom story: teacher on leave (red) -> substitute found (yellow) -> normal
    const cycle = 14;
    const s = forcedStory ? Math.min(storyClock, 9.5) : storyClock % cycle;
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * 6);
    if (s > 1 && s < 5) {
      M.glassStory.emissive.copy(RED);
      M.glassStory.emissiveIntensity = 2.2 * pulse;
    } else if (s >= 5 && s < 10) {
      M.glassStory.emissive.copy(YELLOW);
      M.glassStory.emissiveIntensity = 2.0;
    } else {
      M.glassStory.emissive.set('#ffcf8c');
      M.glassStory.emissiveIntensity = k * 0.95;
    }
  };

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 54 : 36;
    camera.updateProjectionMatrix();
    post.setSize(w, h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting && !document.hidden));
  io.observe(container);
  const onVis = () => (visible = !document.hidden);
  document.addEventListener('visibilitychange', onVis);

  applyTime();
  updateStory();

  const frame = (dt) => {
    elapsed += dt;
    storyClock += dt;
    if (Math.abs(kTarget - k) > 0.0005) {
      k += Math.sign(kTarget - k) * Math.min(Math.abs(kTarget - k), dt / 2.2);
      envTimer += dt;
      const rebuild = envTimer > 0.3 || Math.abs(kTarget - k) < 0.0005;
      if (rebuild) envTimer = 0;
      applyTime(rebuild);
    }
    updateStory();
    sky.update(elapsed);
    trees.update(elapsed);
    const gs = grounds.grass.material.userData.shader;
    if (gs) gs.uniforms.uTime.value = elapsed;
    flag.update(elapsed);
    vehicles.update(dt);
    people?.update(dt, k);
    birds?.update(elapsed, dt, k);
    if (beacon.visible) {
      const p = 1 + Math.sin(elapsed * 3) * 0.12;
      ring.scale.set(p, 1, p);
    }
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur);
      const e = ease(flight.t);
      camera.position.lerpVectors(flight.fromCam, flight.toCam, e);
      const tg = new THREE.Vector3().lerpVectors(flight.fromT, flight.toT, e);
      (controls ? controls.target : target).copy(tg);
      camera.lookAt(tg);
      if (flight.t >= 1) flight = null;
    } else if (controls) {
      controls.update();
    }
    post.render(elapsed, k);
  };

  const tick = (now) => {
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible || !ready) return;
    frame(dt);
  };

  // wait for every texture and model, then fade the scene in
  const readyP = Promise.all([peopleP, birdsP]).then(async ([p, b]) => {
    people = p;
    birds = b;
    await L.done();
    if (!running) return;
    renderer.compile(scene, camera);
    ready = true;
    // settle animations and lighting before the first visible frame
    for (let i = 0; i < 3; i++) frame(1 / 60);
    renderer.domElement.style.opacity = '1';
    onReady?.(true);
  });
  readyP.catch((err) => {
    console.error('[campus]', err);
    onReady?.(false);
  });
  if (!still) requestAnimationFrame(tick);

  return {
    ready: readyP,
    canvas: renderer.domElement,
    /** still mode: render one high-quality frame */
    renderStill() {
      for (let i = 0; i < 3; i++) frame(1 / 30);
      renderer.info.autoReset = false;
      renderer.info.reset();
      frame(1 / 30);
      renderer.info.autoReset = true;
      const r = renderer.info.render;
      window.__campusInfo = { calls: r.calls, triangles: r.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
      return renderer.domElement;
    },
    setTime(name) {
      kTarget = name === 'evening' ? 1 : 0;
      if (reduceMotion || !ready) {
        k = kTarget;
        applyTime();
      }
    },
    goTo(i) {
      const s = STOPS[i];
      if (!s) return;
      flyTo(s.cam, s.target);
      beacon.position.set(...s.beacon);
      beacon.visible = true;
      beam.visible = !s.story;
      forcedStory = Boolean(s.story);
      if (s.story) storyClock = 0;
    },
    endTour() {
      beacon.visible = false;
      forcedStory = false;
      flyTo(HOME_VIEW.cam, HOME_VIEW.target, 2.6);
      if (controls) setTimeout(() => controls && (controls.autoRotate = !reduceMotion), 2700);
    },
    dispose() {
      running = false;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      controls?.dispose();
      post.dispose();
      sky.dispose();
      scene.traverse((o) => {
        if (o.isMesh || o.isPoints || o.isSprite) {
          o.geometry?.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
