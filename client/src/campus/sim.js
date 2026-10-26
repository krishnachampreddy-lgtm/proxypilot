import * as THREE from 'three';
import { FL } from './school.js';
import { PHASES, DAY_START, DAY_END, phaseAt, clockLabel, phaseLabel } from './day.js';

/*
  A school day, from the gate opening to the gate closing.

  07:15  gate opens · teachers drive in · buses and autos drop students · students walk in
  08:12  assembly in the courtyard (the rows fill as students arrive), latecomers run in
  08:35  classes · the lines break up · PE class jogs round the track · teachers in corridors
  12:30  lunch break · groups in the yard and on the lawns · a basketball game
  13:10  classes · football in PE
  15:20  home time · students stream to the buses and the gate · buses leave one by one
  16:05  evening · teachers drive home · a few kids play football · the gate closes at 17:35

  The clock runs faster through lessons and slower through the busy moments.
*/

const V = (x, z, y = 0.08) => new THREE.Vector3(x, y, z);
const hm = (h, m = 0) => h * 60 + m;

export { PHASES, DAY_START, DAY_END, phaseAt, clockLabel, phaseLabel };

// ---------- places ----------
const SLOTS = [
  { x: 38, z: 33.2 },
  { x: 26, z: 33.2 },
  { x: 38, z: 25.8 },
  { x: 26, z: 25.8 },
];
// buses park nose-to-tail, so the front ones (slots 1 and 3) have to leave first
const DEPART_RANK = [2, 0, 3, 1];
const CAR_SLOTS = [-28, -24, -20];
const EXITS = [V(0, -14.6), V(-14, -24.4), V(14, -24.4), V(-26.4, -14), V(-26.4, 2), V(26.4, -14), V(26.4, 2)];
const HANGOUTS = [
  V(-8, -2), V(6, 1), V(-14, -8), V(12, -10), V(-4, 4), V(16, 4), V(-18, 3), V(9, -16), V(-10, -17), V(19, -3),
  V(-14, 16), V(-18, 24), V(-12, 28), V(20, 14), V(30, 16), V(38, 12),
];
const COURT = { x0: -68, x1: -56, z0: -9, z1: 15 };
const PITCH = { x0: 74, x1: 96, z0: -54, z1: -6 };
const DRIVE_IN = [V(0.5, 43.4), V(0.8, 30), V(1.4, 14), V(0.6, 4)];

const busIn = (s) => [
  [-66, 49.5], [-34, 49.5], [-12, 49.4], [-4.5, 48.4], [-0.4, 46.2], [1.6, 43], [2.2, 40.6], [4.8, 38.3], [10, 37.8], [44, 37.8], [47.6, 36.4],
  ...(s.z > 30 ? [[48.2, 34.6], [46, 33.3]] : [[48.4, 31], [47.8, 27.6], [45.6, 25.9]]),
  [s.x + 6, s.z], [s.x, s.z],
];
const busOut = (s) => [
  [s.x, s.z], [s.x - 6, s.z], [14, s.z],
  ...(s.z > 30 ? [[8.6, 35.6], [4.4, 38.4]] : [[8.4, 28.6], [4.6, 33.5], [3.2, 38]]),
  [2.8, 41], [2.6, 44.2], [4, 47.2], [9, 49.3], [30, 49.5], [150, 49.5],
];
const busDoor = (s) => V(s.x - 3.6, s.z + 1.4);
const busWalk = (s) => (s.z > 30 ? [V(s.x - 3.6, 35.7), V(8, 35.7), V(4.2, 31), V(2.2, 26)] : [V(s.x - 3.6, 28.6), V(9, 28.8), V(4.8, 27), V(2.2, 24)]);
const carIn = (x) => [[-80, 49.5], [-30, 49.5], [-12, 49.4], [-5, 48.6], [-1.8, 46], [-2.2, 42], [-4.2, 39.4], [-12, 38.8], [-33.5, 38.8], [-36.6, 37], [-34, 34.6], [x - 2.5, 34.6], [x, 34.6]];
const carOut = (x) => [[x, 34.6], [x + 3, 34.6], [-10, 34.8], [-5, 37.5], [-2.4, 41], [-1.8, 45], [-5, 50.5], [-14, 56.5], [-150, 56.5]];
const autoIn = [[-70, 49.5], [-30, 49.5], [-12, 48.2], [-6, 47.3]];
const autoOut = [[-6, 47.3], [4, 48.4], [18, 49.5], [150, 49.5]];

export function createSim({ people, vehicles, grounds, scene, rng, onBell }) {
  const { pool, assembly, crowd } = people;
  const F = vehicles.fleet;
  const total = assembly.slots.length;
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const jitter = (v, r = 0.8) => v.clone().add(new THREE.Vector3((rng() - 0.5) * r, 0, (rng() - 0.5) * r));
  const nearestExit = (p) => EXITS.reduce((b, e) => (e.distanceToSquared(p) < b.distanceToSquared(p) ? e : b), EXITS[0]);
  const randIn = (r) => V(r.x0 + rng() * (r.x1 - r.x0), r.z0 + rng() * (r.z1 - r.z0));
  // every person knows which system moves them (the instanced crowd or the animated pool)
  const route = (a, pts, o) => a.sys.route(a, pts, o);
  const release = (a) => a.sys.release(a);
  /** a student: from the crowd if there's room, otherwise an animated one */
  const student = (pts, opts = {}) => crowd.spawn(pts, opts) || pool.spawn(pts, { ...opts, teacher: false });
  const everyone = () => [...crowd.agents, ...pool.agents];
  const busFull = Math.max(5, Math.min(12, Math.round(crowd.agents.length * 0.1)));

  let minutes = DAY_START;
  let last = DAY_START;
  let phase = null;
  let gateOpen = 0;
  let agentFill = 0;
  let assigned = 0;
  let paused = false;
  let speedOverride = null;
  const timers = {};
  const every = (key, sec, dt, fn) => {
    timers[key] = (timers[key] ?? rng() * sec) - dt;
    if (timers[key] <= 0) {
      timers[key] = sec * (0.6 + rng() * 0.8);
      fn();
    }
  };
  // things that happen a few seconds from now (cleared when the day jumps)
  let queue = [];
  const later = (sec, fn) => queue.push({ t: sec, fn });

  // football and its ball
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5 }));
  ball.castShadow = true;
  ball.visible = false;
  scene.add(ball);
  const ballState = { pos: V(85, -30, 0.12), vel: new THREE.Vector3(), area: PITCH, players: [] };

  // ---------- helpers that send people places ----------
  const toSlot = (start, via, opts = {}) => {
    const idx = Math.min(total - 1, Math.max(assigned, Math.floor(assembly.fill * total)) + Math.floor(rng() * 6));
    const slot = assembly.slotFor(idx);
    const ref = (via.length ? via[via.length - 1] : start).z - 1;
    const pts = [start, ...via, ...DRIVE_IN.filter((p) => p.z < ref), V(slot.x, slot.z)];
    const a = student(pts, {
      run: opts.run,
      pace: 1.3,
      face: Math.PI,
      onArrive: (b) => {
        agentFill = Math.min(1, agentFill + 1 / total);
        release(b);
      },
    });
    if (a) {
      assigned++;
      a.tag = 'arriving';
    }
    return a;
  };
  const leaveBy = (start, kind) => {
    if (kind === 'bus') {
      const boarding = F.buses.filter((b) => b.boarding && b.obj.visible && !b.active);
      if (!boarding.length) return leaveBy(start, 'gate');
      const bus = boarding.reduce((m, b) => (b.load + b.coming < m.load + m.coming ? b : m), boarding[0]);
      const walk = busWalk(bus.slot).slice().reverse();
      const a = student([start, jitter(V(0.6, 4), 2), V(1.4, 14), ...walk, busDoor(bus.slot)], {
        pace: 1.5,
        onArrive: (b) => {
          bus.coming = Math.max(0, bus.coming - 1);
          if (bus.boarding) bus.load++;
          release(b);
        },
      });
      if (a) {
        bus.coming++;
        a.tag = 'home';
      }
      return a;
    }
    const side = rng() < 0.5 ? -1 : 1;
    const a = student([start, jitter(V(0, -2), 6), V(0.6, 4), V(1.4, 14), V(0.8, 30), V(0.5, 43.4), V(side * 3, 44.7), V(side * (30 + rng() * 25), 44.7)], {
      pace: 1.35,
      onArrive: release,
    });
    if (a) a.tag = 'home';
    return a;
  };
  const wander = (a) => {
    route(a, [jitter(pick(HANGOUTS), 3)], { wait: 4 + rng() * 9, face: rng() * 6.28, onArrive: (b) => (b.tag === 'lunch' ? wander(b) : null) });
  };
  const runAround = (a, area, tag) => {
    route(a, [randIn(area)], { run: true, onArrive: (b) => b.tag === tag && runAround(b, area, tag) });
  };
  const trackLap = (() => {
    const out = [];
    const cx = 85, cz = -30, r = 17.2, half = 22;
    for (let i = 0; i <= 8; i++) out.push(V(cx + r, cz + half - (2 * half * i) / 8, 0.1));
    for (let i = 1; i < 12; i++) { const a = (i / 12) * Math.PI; out.push(V(cx + Math.cos(a) * r, cz - half - Math.sin(a) * r, 0.1)); }
    for (let i = 0; i <= 8; i++) out.push(V(cx - r, cz - half + (2 * half * i) / 8, 0.1));
    for (let i = 1; i < 12; i++) { const a = Math.PI + (i / 12) * Math.PI; out.push(V(cx + Math.cos(a) * r, cz + half - Math.sin(a) * r, 0.1)); }
    return out;
  })();
  const jog = (a, start) => {
    const lap = trackLap.slice(start).concat(trackLap.slice(0, start));
    route(a, lap, { run: true, onArrive: (b) => b.tag === 'pe' && jog(b, 0) });
  };
  /** everyone with this tag heads back into the building */
  const sendInside = (tag) => {
    for (const a of everyone()) {
      if (!a.active || a.tag !== tag) continue;
      a.tag = 'leaving';
      route(a, [nearestExit(a.pos)], { pace: 1.2, onArrive: release });
    }
  };
  const corridorWalker = () => {
    const routes = [
      [V(6, -26.2, FL[1] + 0.03), V(27.5, -26.2, FL[1] + 0.03)],
      [V(-27.5, -26.2, FL[2] + 0.03), V(-6, -26.2, FL[2] + 0.03)],
      [V(-28.2, -22, FL[1] + 0.03), V(-28.2, 6, FL[1] + 0.03)],
      [V(28.2, 6, FL[2] + 0.03), V(28.2, -22, FL[2] + 0.03)],
      [V(-28.2, 5, 0.53), V(-28.2, -21, 0.53)],
    ];
    const r = pick(routes);
    if (rng() < 0.5) r.reverse();
    pool.spawn(r, { teacher: rng() < 0.4 ? true : undefined, tag: 'corridor', onArrive: release });
  };
  const playFootball = (n) => {
    ball.visible = true;
    ballState.pos.set(85, 0.12, -30);
    ballState.vel.set(0, 0, 0);
    ballState.players = [];
    for (let i = 0; i < n; i++) {
      const a = pool.spawn([nearestExit(V(40, -10)), V(60, -10), randIn(PITCH)], { teacher: false, tag: 'football' });
      if (a) ballState.players.push(a);
    }
  };
  const stopFootball = () => {
    ball.visible = false;
    ballState.players = [];
    sendInside('football');
  };

  // ---------- vehicles ----------
  const busArrive = (i) => {
    const b = F.buses[i];
    b.slot = SLOTS[i];
    b.load = 0;
    b.coming = 0;
    b.boarding = false;
    b.drive(busIn(b.slot), {
      max: 7,
      onEnd: () => {
        b.unload = 10 + Math.floor(rng() * 5);
        b.unloadTimer = 1;
      },
    });
  };
  const busDepart = (i) => {
    const b = F.buses[i];
    if (!b.obj.visible || b.active) return;
    b.boarding = false;
    b.departAt = null;
    b.drive(busOut(b.slot), { max: 8, onEnd: () => (b.obj.visible = false) });
  };
  const parkBus = (i) => {
    const b = F.buses[i];
    b.slot = SLOTS[i];
    b.drive(busIn(b.slot));
    b.s = b.len;
    b.active = false;
    b.place();
    b.unload = 0;
  };
  const carArrive = (i) => {
    const c = F.cars[i];
    c.drive(carIn(CAR_SLOTS[i]), {
      max: 9,
      onEnd: () => pool.spawn([V(CAR_SLOTS[i] - 1, 36.4), V(-8, 33), V(-1.4, 26), V(-1, 12), V(0, -14.6)], { teacher: true, onArrive: release }),
    });
  };
  const carDepart = (i) => {
    const c = F.cars[i];
    if (!c.obj.visible) return;
    const go = () => c.drive(carOut(CAR_SLOTS[i]), { max: 9, onEnd: () => (c.obj.visible = false) });
    // the teacher walks out to the car first
    const t = pool.spawn([V(0, -14.6), V(-1, 12), V(-1.4, 26), V(-8, 33), V(CAR_SLOTS[i] - 1, 36.4)], {
      teacher: true,
      pace: 1.2,
      onArrive: (a) => {
        release(a);
        go();
      },
    });
    if (!t) go();
  };
  const parkCar = (i) => {
    const c = F.cars[i];
    c.drive(carIn(CAR_SLOTS[i]));
    c.s = c.len;
    c.active = false;
    c.place();
  };
  const autoRun = (i, dropping) => {
    const a = F.autos[i];
    a.drive(autoIn, {
      max: 8,
      onEnd: () => {
        a.stopped = true;
        if (dropping) for (let k = 0; k < 3; k++) later(k * 0.5, () => toSlot(V(-5.4 + k * 0.5, 46.1), [V(-1, 44.6)]));
        a.leaveIn = 4;
      },
    });
  };

  const EVENTS = [
    [hm(7, 16), () => carArrive(0)], [hm(7, 19), () => carArrive(1)], [hm(7, 23), () => carArrive(2)],
    [hm(7, 17), () => busArrive(0)], [hm(7, 22), () => busArrive(1)], [hm(7, 27), () => busArrive(2)], [hm(7, 32), () => busArrive(3)],
    [hm(7, 30), () => autoRun(0, true)], [hm(7, 44), () => autoRun(1, true)],
    [hm(8, 12), () => onBell?.('Assembly')], [hm(8, 35), () => onBell?.('Classes')], [hm(12, 30), () => onBell?.('Lunch break')],
    [hm(13, 10), () => onBell?.('Classes')], [hm(15, 20), () => onBell?.('Home time')],
    [hm(15, 21), () => F.buses.forEach((b, i) => {
      if (!b.obj.visible) return;
      b.boarding = true;
      b.departAt = hm(15, 47) + DEPART_RANK[i] * 3; // leaves once enough students are on board
    })],
    [hm(15, 28), () => autoRun(0, false)], [hm(15, 34), () => autoRun(1, false)],
    [hm(16, 22), () => carDepart(0)], [hm(16, 31), () => carDepart(1)], [hm(16, 40), () => carDepart(2)],
  ];

  // ---------- phase changes ----------
  const enter = (p) => {
    assembly.setLeaders(p.id === 'assembly');
    if (p.id === 'assembly') {
      // anyone still on the way hurries; a few latecomers run in from the gate
      for (const a of everyone()) if (a.active && a.tag === 'arriving') a.run = true;
      for (let k = 0; k < 4; k++) later(2 + k * 1.6, () => toSlot(V((rng() - 0.5) * 2, 46), [], { run: true }));
    }
    if (p.id === 'classes') {
      for (let i = 0; i < 6; i++) {
        const a = pool.spawn([V(30, -12), V(60, -12), trackLap[i * 7]], { teacher: false, tag: 'pe' });
        if (a) jog(a, i * 7);
      }
      pool.spawn([V(30, -12), V(66, -30)], { teacher: true, tag: 'pe', wait: 9999, face: Math.PI / 2 });
    }
    if (p.id === 'lunch') {
      for (let i = 0; i < 6; i++) {
        const a = pool.spawn([pick(EXITS), randIn(COURT)], { teacher: false, tag: 'basket' });
        if (a) runAround(a, COURT, 'basket');
      }
    }
    if (p.id === 'classes2') playFootball(8);
    if (p.id === 'evening') later(4, () => playFootball(6));
  };
  const exit = (p) => {
    if (p.id === 'arrival' || p.id === 'assembly') sendInside('arriving');
    if (p.id === 'classes') sendInside('pe');
    if (p.id === 'lunch') {
      sendInside('lunch');
      sendInside('basket');
    }
    if (p.id === 'classes2' || p.id === 'evening') stopFootball();
  };

  /** put everything where it would be at this time of day */
  const resetTo = (m) => {
    minutes = last = m;
    queue = [];
    pool.releaseAll();
    crowd.releaseAll();
    ball.visible = false;
    ballState.players = [];
    agentFill = 0;
    assigned = 0;
    F.buses.forEach((b, i) => {
      b.active = false;
      b.boarding = false;
      b.unload = 0;
      b.load = 0;
      b.coming = 0;
      b.departAt = null;
      const arrive = hm(7, 17) + i * 5 + 14;
      const leave = hm(15, 47) + DEPART_RANK[i] * 3;
      if (m > arrive && m < leave) {
        parkBus(i);
        if (m > hm(15, 21)) {
          b.boarding = true;
          b.departAt = leave;
        }
      } else b.obj.visible = false;
    });
    F.cars.forEach((c, i) => {
      c.active = false;
      const arrive = [hm(7, 16), hm(7, 19), hm(7, 23)][i] + 8;
      const leave = [hm(16, 22), hm(16, 31), hm(16, 40)][i];
      if (m > arrive && m < leave) parkCar(i);
      else c.obj.visible = false;
    });
    F.autos.forEach((a) => {
      a.active = false;
      a.obj.visible = false;
      a.stopped = false;
    });
    gateOpen = m >= hm(7, 16) && m < hm(17, 35) ? 1 : 0;
    grounds.setGate(gateOpen);
    phase = phaseAt(m);
    if (phase.id === 'assembly') agentFill = 1;
    enter(phase);
  };

  let clockCb = null;
  let clockT = 0;
  resetTo(DAY_START);

  return {
    get minutes() {
      return minutes;
    },
    get phase() {
      return phase;
    },
    onClock(cb) {
      clockCb = cb;
    },
    jumpTo(m) {
      resetTo(Math.max(DAY_START, Math.min(DAY_END - 1, m)));
      clockCb?.(minutes, phase);
    },
    setPaused(p) {
      paused = p;
    },
    setSpeed(s) {
      speedOverride = s;
    },
    update(dt) {
      if (!paused) minutes += (speedOverride ?? phaseAt(minutes).speed) * dt;
      if (minutes >= DAY_END) {
        resetTo(DAY_START);
        clockCb?.(minutes, phase);
      }
      // timetable events
      for (const [at, fn] of EVENTS) if (at > last && at <= minutes) fn();
      last = minutes;
      // phase changes
      const p = phaseAt(minutes);
      if (p !== phase) {
        exit(phase);
        phase = p;
        enter(p);
      }
      // delayed actions
      if (queue.length) {
        const due = [];
        queue = queue.filter((j) => ((j.t -= dt) <= 0 ? (due.push(j), false) : true));
        due.forEach((j) => j.fn());
      }

      // ---- continuous life for each part of the day ----
      if (p.id === 'arrival') {
        // students walking in along the road from both sides
        if (minutes > hm(7, 18)) every('gate', 0.5, dt, () => toSlot(V((rng() < 0.5 ? -1 : 1) * (12 + rng() * 22), 44.7), [V(rng() < 0.5 ? -3 : 3, 44.7)]));
        // the courtyard fills steadily even when everyone visible is busy
        const timeFill = THREE.MathUtils.smoothstep(minutes, hm(7, 24), hm(8, 11)) * 0.95;
        assembly.setFill(Math.max(agentFill, timeFill));
      } else if (p.id === 'assembly') {
        assembly.setFill(1);
      } else if (p.id === 'classes' && minutes < hm(8, 43)) {
        // lines break up from the back; those students walk to their classrooms
        const target = 1 - THREE.MathUtils.smoothstep(minutes, hm(8, 35), hm(8, 42));
        const before = Math.round(assembly.fill * total);
        assembly.setFill(target);
        const after = Math.round(assembly.fill * total);
        for (let i = after; i < before; i++) {
          const sl = assembly.slotFor(i);
          const a = crowd.spawn([V(sl.x, sl.z), nearestExit(V(sl.x, sl.z))], { pace: 1.1, onArrive: release });
          if (!a) break;
        }
      } else if (assembly.fill > 0) assembly.setFill(0);
      if (p.id === 'classes' || p.id === 'classes2') every('corridor', 2.5, dt, corridorWalker);
      if (p.id === 'lunch' && minutes < hm(13, 4)) {
        every('lunch', 0.22, dt, () => {
          const a = crowd.spawn([pick(EXITS), jitter(pick(HANGOUTS), 3)], { tag: 'lunch', wait: 5 + rng() * 8, face: rng() * 6.28 });
          if (a) a.onArrive = (b) => b.tag === 'lunch' && wander(b);
        });
      }
      if (p.id === 'home' && minutes < hm(15, 56)) {
        every('leave', 0.16, dt, () => leaveBy(pick(EXITS), rng() < 0.58 ? 'bus' : 'gate'));
      }
      if (p.id === 'evening') {
        every('corridor', 6, dt, corridorWalker);
        if (minutes < hm(16, 50)) every('late', 2.5, dt, () => leaveBy(pick(EXITS), 'gate'));
      }

      // ---- buses unloading in the morning ----
      for (const b of F.buses) {
        if (b.unload > 0) {
          b.unloadTimer -= dt;
          if (b.unloadTimer <= 0) {
            b.unloadTimer = 0.3;
            if (toSlot(busDoor(b.slot), busWalk(b.slot))) b.unload--;
          }
        }
      }
      // ---- buses leave in turn once boarded (or when they can't wait any longer) ----
      F.buses.forEach((b, i) => {
        if (b.departAt && minutes >= b.departAt && (b.load >= busFull || minutes >= b.departAt + 7)) {
          const ahead = F.buses.some((o, j) => DEPART_RANK[j] < DEPART_RANK[i] && o.departAt); // keep the order
          const driving = F.buses.some((o) => o.active && o.obj.visible && o.obj.position.z < 46); // one at a time through the gate
          if (!ahead && !driving) busDepart(i);
        }
      });
      // ---- autos wait a moment at the gate, then go ----
      for (const a of F.autos) {
        if (a.stopped) {
          a.leaveIn -= dt;
          if (a.leaveIn <= 0) {
            a.stopped = false;
            a.drive(autoOut, { max: 8, onEnd: () => (a.obj.visible = false) });
          }
        }
      }
      // ---- road traffic waits while school vehicles turn at the gate ----
      const busy = [...F.buses, ...F.cars, ...F.autos].some((d) => (d.active || d.stopped) && d.obj.visible && Math.abs(d.obj.position.x) < 16 && d.obj.position.z > 40);
      vehicles.setGateBusy(busy);

      // ---- football: players chase the ball, the nearest one kicks it ----
      if (ball.visible) {
        const bs = ballState;
        bs.pos.addScaledVector(bs.vel, dt);
        bs.vel.multiplyScalar(Math.pow(0.35, dt));
        if (bs.pos.x < bs.area.x0 || bs.pos.x > bs.area.x1) bs.vel.x *= -1;
        if (bs.pos.z < bs.area.z0 || bs.pos.z > bs.area.z1) bs.vel.z *= -1;
        let nearest = null;
        let nd = Infinity;
        for (const a of bs.players) {
          if (!a.active || a.tag !== 'football') continue;
          const d = a.pos.distanceTo(bs.pos);
          if (d < nd) {
            nd = d;
            nearest = a;
          }
          if (!a.path || a.seg >= a.path.length || rng() < dt * 0.6) {
            const off = a === nearest ? new THREE.Vector3() : new THREE.Vector3((rng() - 0.5) * 14, 0, (rng() - 0.5) * 14);
            route(a, [V(bs.pos.x + off.x, bs.pos.z + off.z, 0.1)], { run: a === nearest || rng() < 0.6 });
          }
        }
        if (nearest && nd < 0.9) {
          const ang = rng() * Math.PI * 2;
          bs.vel.set(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(7 + rng() * 7);
        }
        ball.position.set(bs.pos.x, 0.12, bs.pos.z);
        ball.rotation.x += bs.vel.length() * dt * 2;
      }

      // ---- the gate slides open in the morning and shut at night ----
      const want = minutes >= hm(7, 15) && minutes < hm(17, 35) ? 1 : 0;
      if (Math.abs(want - gateOpen) > 0.001) {
        gateOpen += Math.sign(want - gateOpen) * Math.min(Math.abs(want - gateOpen), dt * 0.25);
        grounds.setGate(gateOpen);
      }

      pool.update(dt);
      crowd.update(dt);
      clockT += dt;
      if (clockT > 0.25) {
        clockT = 0;
        clockCb?.(minutes, phase);
      }
    },
  };
}
