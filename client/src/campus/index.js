import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createLoader } from './assets.js';
import { createMaterials } from './materials.js';
import { Batch } from './batch.js';
import { createSky } from './sky.js';
import { createPost } from './post.js';
import { buildSchool } from './school.js';
import { buildGrounds } from './grounds.js';
import { buildTown } from './town.js';
import { buildTrees } from './trees.js';
import { buildVehicles } from './vehicles.js';
import { createPeople } from './people.js';
import { buildFlag, buildBirds } from './life.js';
import { createSim, DAY_START } from './sim.js';
import { PROFILES, detectProfile, Governor } from './quality.js';
import { rng as makeRng, ease } from './util.js';
import { STOPS } from './stops.js';
import { ROOMS } from './rooms.js';
import { lodReady } from './lod.js';

/*
  ProxyPilot campus — a living Indian school, rendered live in the browser.
  A full school day plays out: buses and autos drop students, assembly, classes,
  lunch, home time, evening. A director camera follows the action; drag to look around.
*/

export { STOPS };
/** await before createCampus: the mesh simplifier loads asynchronously */
export const prepared = lodReady;

const HOME_VIEW = { cam: [78, 30, 92], target: [-6, 2, -6] };
export const HOD_VIEW = { cam: [0, 24, 36], target: [0, 4, -16] };
export const STILL_VIEW = { cam: [-58, 24, 66], target: [2, 6, -14] };

// shots the director cuts between, by part of the day: [camera, target]
export const SHOTS = {
  arrival: [[[22, 7, 55], [2, 1.5, 37]], [[9, 4.2, 51], [-1, 1.2, 36]], [[-8, 11, 41], [8, 1, 20]], [[18, 13, 11], [31, 1.2, 31]], [[-16, 9, -6], [-26, 4, -22]]],
  gather: [[[-20, 10, 14], [-4, 3, -16]], [[14, 12, 18], [2, 2, -10]], [[24, 9, -6], [27, -1, -24]]],
  assembly: [[[-28, 14, 16], [0, 1.5, -6]], [[18, 7, 12], [-2, 1.8, -8]], [[0, 16, 26], [0, 0.5, -4]]],
  toclass: [[[-18, 9, 10], [-6, 3, -18]], [[20, 10, 12], [8, 3, -14]]],
  classes: [[[58, 18, 12], [85, 0, -28]], [[12, 9, -6], [8, 6, -26]], [[-20, 7, 10], [-28, 4, -8]]],
  lunch: [[[-30, 12, 14], [0, 1.4, -4]], [[-42, 10, 18], [-62, 1, 2]], [[5, 9, 22], [-8, 1.2, 4]]],
  classes2: [[[60, 16, 6], [85, 0, -30]], [[16, 9, -4], [10, 6, -26]]],
  home: [[[-22, 10, 12], [0, 2, -12]], [[18, 13, 11], [31, 1.2, 31]], [[14, 8, 56], [2, 1.5, 36]], [[6, 7, 57], [-6, 1, 46]], [[-26, 9, 16], [0, 1.4, 4]]],
  evening: [[[96, 30, 100], [-6, 3, -8]], [[60, 16, 10], [85, 0, -30]]],
};

export function createCampus(container, { mode = 'hero', time = 'morning', startMinutes, onProgress, onReady, onClock, onBell, view } = {}) {
  const still = mode === 'still';
  const forcedQ = new URLSearchParams(window.location.search).get('q');
  const P = still ? PROFILES[forcedQ] || PROFILES.still : detectProfile();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: still || new URLSearchParams(window.location.search).has('pdb'), stencil: false });
  } catch {
    onReady?.(false);
    return null;
  }
  const maxDpr = Math.min(window.devicePixelRatio || 1, P.dpr);
  renderer.setPixelRatio(maxDpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%', opacity: still ? '1' : '0', transition: still ? 'none' : 'opacity 1.2s ease' });
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.6, 3500);
  const v0 = view || (still ? STILL_VIEW : mode === 'hod' ? HOD_VIEW : HOME_VIEW);
  camera.position.set(...v0.cam);
  const target = new THREE.Vector3(...v0.target);
  camera.lookAt(target);

  const rng = makeRng(20261026);
  const L = createLoader(onProgress);
  const M = createMaterials(L, { quality: P.name });
  M.glassLit = M.glass.clone();
  M.glassLit.emissive = new THREE.Color('#ffcf8c');
  M.glassLit.emissiveIntensity = 0;
  M.glassStory = M.glass.clone();
  M.glassStory.emissive = new THREE.Color('#ff3b2a');
  M.glassStory.emissiveIntensity = 0;

  const sky = createSky(renderer, scene, { shadowSize: P.shadow, flare: !still && P.name !== 'low' });

  // ---- static world, merged per material ----
  const B = new Batch(M);
  const school = buildSchool(scene, B, M, rng);
  const grounds = buildGrounds(scene, B, M, L, rng, P);
  const flag = buildFlag(scene, B, 0, -11);
  B.build(scene, { noCast: ['line', 'tiles', 'pavers', 'asphalt', 'track', 'court', 'courtOut'] });
  const TB = new Batch(M);
  buildTown(TB, M, rng, P);
  TB.build(scene, { castShadow: P.townShadows });

  const trees = buildTrees(scene, L, rng, { P, merge: (list) => mergeGeometries(list) });
  const vehicles = buildVehicles(scene, rng, P);
  const peopleP = createPeople(scene, L, rng, P, camera);
  const birdsP = still ? Promise.resolve(null) : buildBirds(scene, L, rng, { count: P.name === 'low' ? 6 : 12 }).catch(() => null); // birds are a nice extra, never a blocker

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

  // ---- today's cover, shown on the classrooms (HOD view) ----
  const coverGroup = new THREE.Group();
  scene.add(coverGroup);
  const STATUS_COLOR = { accepted: '#62d39b', pending: '#f4c542', uncovered: '#f07a62' };
  let coverItems = [];
  const labelTexture = (title, sub, color) => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 168;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(6,11,9,0.82)';
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.beginPath();
    if (g.roundRect) g.roundRect(6, 6, 628, 156, 26);
    else g.rect(6, 6, 628, 156);
    g.fill();
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.arc(52, 62, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#edf2ec';
    g.font = '600 56px Geist, system-ui, sans-serif';
    g.fillText(title, 84, 82);
    g.fillStyle = '#c5d1c8';
    g.font = '400 36px Geist, system-ui, sans-serif';
    g.fillText(sub.length > 30 ? sub.slice(0, 29) + '…' : sub, 30, 138);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const clearCover = () => {
    for (const o of [...coverGroup.children]) {
      coverGroup.remove(o);
      o.traverse((m) => {
        m.geometry?.dispose();
        m.material?.map?.dispose();
        m.material?.dispose();
      });
    }
    coverItems = [];
  };
  const setCover = (items) => {
    clearCover();
    for (const it of items) {
      const r = ROOMS[it.room % ROOMS.length];
      const color = STATUS_COLOR[it.status] || '#94a59b';
      const g = new THREE.Group();
      g.position.set(r.x + r.nx * 0.14, r.y, r.z + r.nz * 0.14);
      g.rotation.y = Math.atan2(r.nx, r.nz);
      // the classroom windows glow in the status colour
      const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.4), glowMat);
      g.add(glow);
      // a label floating over the corridor
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(it.title, it.sub, color), depthTest: false, transparent: true }));
      sprite.scale.set(7.4, 1.94, 1);
      sprite.position.set(0, 2.5, 2.6);
      sprite.renderOrder = 10;
      g.add(sprite);
      // a ring on the corridor floor
      const ringM = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false });
      const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.86, 40).rotateX(-Math.PI / 2), ringM);
      ringMesh.position.set(0, -1.5, 1.2);
      g.add(ringMesh);
      coverGroup.add(g);
      coverItems.push({ ...it, glowMat, ringMesh, sprite });
    }
    renderer.shadowMap.needsUpdate = true;
  };
  const updateCover = (t) => {
    for (const c of coverItems) {
      const k = c.status === 'pending' ? 0.55 + 0.45 * Math.sin(t * 4) : c.status === 'uncovered' ? 0.7 + 0.3 * Math.sin(t * 7) : 0.85;
      c.glowMat.opacity = k;
      const s = 1 + ((t * 0.8 + c.room * 0.13) % 1) * 0.6;
      c.ringMesh.scale.set(s, 1, s);
      c.ringMesh.material.opacity = 0.7 * (1 - ((t * 0.8 + c.room * 0.13) % 1));
    }
  };

  const post = createPost(renderer, scene, camera, P);

  // ---- camera: orbit controls + a director that follows the action ----
  let controls = null;
  let userUntil = 0; // the director waits while someone is looking around
  if (mode === 'hero' || mode === 'hod') {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 260;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = 1.45;
    controls.rotateSpeed = 0.5;
    controls.autoRotate = false;
    if (coarse) {
      controls.enabled = false; // one finger scrolls the page on phones
      renderer.domElement.style.touchAction = 'pan-y';
    }
    controls.addEventListener('start', () => {
      userUntil = performance.now() + 25000;
      flight = null;
    });
    controls.update();
  }
  let flight = null;
  const flyTo = (cam, tgt, dur = 3) => {
    flight = { fromCam: camera.position.clone(), fromT: (controls ? controls.target : target).clone(), toCam: new THREE.Vector3(...cam), toT: new THREE.Vector3(...tgt), t: 0, dur: reduceMotion ? 0.001 : dur };
  };
  let director = mode === 'hero' && !reduceMotion;
  let touring = false;
  let shotTimer = 7; // start on the wide view, then move in to the action
  let shotIdx = 0;
  let shotPhase = null;
  const drift = { angle: 0 };
  const nextShot = (phaseId) => {
    const list = SHOTS[phaseId] || SHOTS.evening;
    if (shotPhase !== phaseId) {
      shotPhase = phaseId;
      shotIdx = 0;
    } else shotIdx = (shotIdx + 1) % list.length;
    const [cam, tgt] = list[shotIdx];
    flyTo(cam, tgt, 4.5);
    drift.angle = 0;
    shotTimer = 15 + rng() * 6;
  };

  // frame the action beside the page's text card (desktop: right of it, phones: above it)
  let shift = { x: 0, y: 0 };
  const applyShift = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    if (shift.x || shift.y) camera.setViewOffset(w, h, -shift.x * w, -shift.y * h, w, h);
    else camera.clearViewOffset();
  };

  // ---- state ----
  let people = null;
  let birds = null;
  let sim = null;
  let ready = false;
  let running = true;
  let visible = true;
  let elapsed = 0;
  let storyClock = 0;
  let forcedStory = false;
  let last = performance.now();
  let envTimer = 99;
  let frameNo = 0;
  let shadowEvery = P.shadowEvery;
  let light = { warm: 0, lights: 0 };
  let minutesNow = startMinutes ?? (time === 'evening' ? 16 * 60 + 40 : DAY_START);
  const RED = new THREE.Color('#ff3b2a');
  const YELLOW = new THREE.Color('#f4c542');

  const applyTime = (rebuildEnv) => {
    light = sky.apply(minutesNow, { rebuildEnv, envDeg: P.envDeg });
    M.glassLit.emissiveIntensity = light.lights * 0.95;
    M.night.value = light.lights;
    M.lampOff.emissiveIntensity = light.lights * 6;
    school.dialMat.emissiveIntensity = light.lights * 0.5;
    school.setClock(minutesNow / 60);
  };

  const updateStory = () => {
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
      M.glassStory.emissiveIntensity = light.lights * 0.95;
    }
  };

  // keeps the frame rate up by trading detail for speed
  const governor = new Governor({
    maxDpr,
    minDpr: Math.min(maxDpr, 0.6),
    onChange: ({ dpr, step }) => {
      if (dpr) {
        renderer.setPixelRatio(dpr);
        resize();
      }
      // each step switches one thing off; returning false means "nothing to do here, try the next"
      if (step === 1) return post.dropAO();
      if (step === 2) return post.dropBloom();
      if (step === 3) {
        if (!grounds.grass.visible) return false;
        grounds.grass.visible = false;
      }
      if (step === 4) trees.setFar(false);
      if (step === 5) {
        if (shadowEvery >= 3) return false;
        shadowEvery = 3;
      }
      if (step === 6) {
        sky.sun.castShadow = false;
        renderer.shadowMap.needsUpdate = true;
      }
      if (step > 6) return true; // nothing left to switch off
    },
  });

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 54 : 36;
    camera.updateProjectionMatrix();
    applyShift();
    post.setSize(w, h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting && !document.hidden));
  io.observe(container);
  const onVis = () => (visible = !document.hidden);
  document.addEventListener('visibilitychange', onVis);

  applyTime(true);
  updateStory();

  const frame = (dt) => {
    elapsed += dt;
    storyClock += dt;
    if (sim) {
      sim.update(dt);
      minutesNow = sim.minutes;
    }
    envTimer += dt;
    const rebuild = envTimer > P.envEvery; // re-lighting from the sky is costly on small chips
    if (rebuild) envTimer = 0;
    applyTime(rebuild);
    updateStory();
    sky.update(elapsed);
    trees.update(elapsed);
    const gs = grounds.grass.material.userData.shader;
    if (gs) gs.uniforms.uTime.value = elapsed;
    flag.update(elapsed);
    vehicles.update(dt);
    birds?.update(elapsed, dt, light.lights);
    if (coverItems.length) updateCover(elapsed);
    if (beacon.visible) {
      const p = 1 + Math.sin(elapsed * 3) * 0.12;
      ring.scale.set(p, 1, p);
    }

    // director: glide between shots of whatever is happening now
    if (director && !touring && sim && performance.now() > userUntil) {
      shotTimer -= dt;
      const pid = sim.phase?.id;
      if (shotTimer <= 0 || (pid !== shotPhase && shotTimer < 12)) nextShot(pid);
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
      // a slow sideways drift keeps every shot alive
      if (director && !touring && performance.now() > userUntil) {
        const t = controls.target;
        const off = camera.position.clone().sub(t);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.018);
        camera.position.copy(t).add(off);
      }
      controls.update();
    }

    frameNo++;
    if (frameNo % shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
    post.render(elapsed, light.warm);
  };

  const tick = (now) => {
    if (!running) return;
    requestAnimationFrame(tick);
    // cap the step so a hiccup doesn't teleport anyone, but keep real-time speed at low frame rates
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible || !ready) return;
    frame(dt);
    governor.tick(dt);
    if (window.__campusDebug && frameNo % 60 === 0) {
      const r = renderer.info.render;
      window.__campusStats = { fps: governor.fps, calls: r.calls, tris: r.triangles, dpr: renderer.getPixelRatio(), step: governor.step, profile: P.name, minutes: minutesNow, agents: people?.pool.activeCount(), crowd: people?.crowd.activeCount() };
    }
  };

  const readyP = Promise.all([peopleP, birdsP]).then(async ([p, b]) => {
    people = p;
    birds = b;
    sim = createSim({ people, vehicles, grounds, scene, rng, onBell });
    sim.onClock((m, ph) => onClock?.(m, ph));
    sim.jumpTo(minutesNow);
    if (mode === 'hod') sim.setSpeed(1 / 60); // the HOD sees the school at the real time
    await L.done();
    if (!running) return;
    renderer.compile(scene, camera);
    ready = true;
    for (let i = 0; i < 3; i++) frame(1 / 60);
    renderer.domElement.style.opacity = '1';
    onReady?.(true);
  });
  readyP.catch((err) => {
    console.error('[campus]', err);
    onReady?.(false);
  });
  if (!still) requestAnimationFrame(tick);
  if (window.__campusDebug) {
    // triangle budget per object, biggest first (for tuning)
    window.__campusBreakdown = () => {
      const rows = [];
      scene.traverseVisible((o) => {
        if (!o.isMesh || !o.geometry) return;
        const g = o.geometry;
        const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
        const n = o.isInstancedMesh ? o.count : 1;
        rows.push([o.name || o.parent?.name || o.material?.name || o.type, Math.round(tris), n, Math.round(tris * n), o.isSkinnedMesh ? 'skinned' : '']);
      });
      rows.sort((a, b) => b[3] - a[3]);
      return rows.slice(0, 40);
    };
  }

  return {
    ready: readyP,
    canvas: renderer.domElement,
    profile: P.name,
    get fps() {
      return governor.fps;
    },
    /** what the school day is doing (testing) */
    debugState() {
      const F = vehicles.fleet;
      const v = (d) => ({ vis: d.obj.visible, act: d.active, x: +d.obj.position.x.toFixed(1), z: +d.obj.position.z.toFixed(1), load: d.load, boarding: d.boarding });
      return { minutes: sim?.minutes, phase: sim?.phase?.id, agents: people?.pool.activeCount(), crowd: people?.crowd.activeCount(), sim: sim?.debug(), footprints: vehicles.footprints(), buses: F.buses.map(v), cars: F.cars.map(v), autos: F.autos.map(v) };
    },
    /** point the camera somewhere and draw one frame (testing and stills) */
    view(cam, tgt) {
      camera.position.set(...cam);
      target.set(...tgt);
      controls?.target.copy(target);
      camera.lookAt(target);
      renderer.shadowMap.needsUpdate = true;
      frame(1 / 30);
      return renderer.domElement;
    },
    renderStill() {
      sim?.setPaused(true);
      for (let i = 0; i < 3; i++) frame(1 / 30);
      renderer.info.autoReset = false;
      renderer.info.reset();
      frame(1 / 30);
      renderer.info.autoReset = true;
      const r = renderer.info.render;
      window.__campusInfo = { calls: r.calls, triangles: r.triangles, profile: P.name };
      return renderer.domElement;
    },
    /** run the school day for a while without drawing (used to make stills of a moment) */
    advance(seconds) {
      sim?.setPaused(false);
      for (let t = 0; t < seconds; t += 1 / 30) {
        sim?.update(1 / 30);
        vehicles.update(1 / 30);
      }
      minutesNow = sim?.minutes ?? minutesNow;
      if (still) sim?.setPaused(true);
    },
    /** jump the school day to a time (minutes after midnight) */
    jumpTo(m) {
      minutesNow = m;
      sim?.jumpTo(m);
      shotTimer = 0.5;
      envTimer = 99;
    },
    setTime(name) {
      this.jumpTo(name === 'evening' ? 15 * 60 + 18 : DAY_START);
    },
    setFrameShift(x, y) {
      shift = { x, y };
      applyShift();
    },
    setDirector(on) {
      director = on;
    },
    /** HOD view: show today's cover on the classrooms. items: [{ room, status, title, sub }] */
    setCover(items) {
      setCover(items || []);
    },
    /** fly to a classroom (index into ROOMS) */
    focusRoom(i) {
      const r = ROOMS[i % ROOMS.length];
      if (!r) return;
      userUntil = performance.now() + 60000;
      flyTo([r.x + r.nx * 15 + r.nz * 4, r.y + 6, r.z + r.nz * 15 - r.nx * 4], [r.x, r.y, r.z], 2.4);
    },
    /** back to the whole-campus view */
    overview() {
      flyTo(v0.cam, v0.target, 2.4);
    },
    goTo(i) {
      const s = STOPS[i];
      if (!s) return;
      touring = true;
      sim?.setSpeed(0.5);
      if (s.clock && sim && Math.abs(sim.minutes - s.clock) > 20) this.jumpTo(s.clock);
      flyTo(s.cam, s.target, 2.8);
      beacon.position.set(...s.beacon);
      beacon.visible = true;
      beam.visible = !s.story;
      forcedStory = Boolean(s.story);
      if (s.story) storyClock = 0;
    },
    endTour() {
      touring = false;
      sim?.setSpeed(null);
      beacon.visible = false;
      forcedStory = false;
      shotTimer = 0.5;
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
