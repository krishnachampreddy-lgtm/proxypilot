import * as THREE from 'three';
import { FL } from './school.js';
import { PHASES, DAY_START, DAY_END, phaseAt, clockLabel, phaseLabel } from './day.js';
import { CLASSROOMS, STAIRS, FEET } from './rooms.js';

/*
  A school day for a thousand-plus students, from the gate opening to the gate closing.

  07:15  gate opens · teachers drive in · buses park in their bays · autos drop children at
         the gate · students walk in with school bags and go up to their classrooms
  07:58  assembly bell · every class comes down the stairs and forms its own line
  08:10  assembly · the whole school in class lines, teachers in front of the flag
  08:28  lines break up from the back, everyone goes back up to class
  08:40  lessons · a PE class jogs round the track · teachers in the corridors
  12:30  lunch · students come down and stand about in groups · basketball
  13:10  lessons · football in PE
  15:20  home bell · classes empty out with their bags → buses (each leaves when its
         children are on board), autos queueing at the gate, or the walk home
  16:05  evening · teachers drive home · the gate shuts at 17:35

  Busy moments run close to real time and lessons fast-forward (see day.js).
*/

export { PHASES, DAY_START, DAY_END, phaseAt, clockLabel, phaseLabel };

const V = (x, z, y = FEET.ground) => new THREE.Vector3(x, y, z);
const hm = (h, m = 0) => h * 60 + m;

// ---------- the bus bay: four drive-through bays, so a bus never passes another ----------
const LANES = [25.2, 28.8, 32.4, 36.0];
const PARK_X = 30;
const busSlot = (i) => ({ x: PARK_X, z: LANES[i] });
const busIn = (s) => [
  [-120, 49.5], [-30, 49.5], [-12, 49.4], [-4.5, 48.4], [-0.4, 46.2], [1.6, 43.4], [4.5, 40.6], [10, 39.5], [44, 39.5], [47.6, 38.7], [48.6, 37.0],
  ...(s.z < 34 ? [[48.7, s.z + 2.2]] : []),
  [46.2, s.z + 0.25], [42, s.z], [s.x, s.z],
];
const busOut = (s) => [
  [s.x, s.z], [s.x - 6, s.z], [16, s.z], [10.6, s.z + 1.2],
  ...(s.z + 4 < 37.5 ? [[8.3, s.z + 4]] : []),
  [7.6, 38.5], [5.6, 41.0], [3.2, 43.0], [2.7, 45.2], [5, 47.6], [12, 49.5], [60, 49.5], [160, 49.5],
];
// the door is at the front on the left; children walk up the aisle beside the bus
const busDoor = (s) => V(s.x - 3.3, s.z + 1.6);
const busAisle = (s) => s.z + 1.85;

// ---------- staff car park: cars drive in nose first from the aisle, and reverse out to leave ----------
const CAR_SLOTS = [-20, -24, -28];
const carIn = (x) => [[-120, 49.5], [-30, 49.5], [-12, 49.4], [-5, 48.6], [-1.8, 46], [-2.2, 42], [-4.6, 39.2], [-10, 38.8], [x + 5, 38.8], [x + 1.6, 37.9], [x, 36.2], [x, 34.8]];
const carBackOut = (x) => [[x, 34.8], [x, 36.6], [x - 1.4, 38.4], [x - 4.2, 38.8]];
const carOut = (x) => [[x - 4.2, 38.8], [-10, 38.8], [-4.6, 39.4], [-2.4, 41], [-1.8, 45], [-5, 50.5], [-14, 56.5], [-150, 56.5]];

// ---------- autos stop at the kerb just outside the gate and queue behind each other ----------
const AUTO_STOP = [-6, 47.0];
const autoIn = [[-110, 49.5], [-30, 49.5], [-14, 47.4], AUTO_STOP];
const autoOut = [AUTO_STOP, [0, 47.6], [8, 49.3], [20, 49.5], [160, 49.5]];
const AUTO_SEATS = 4;

// ---------- places ----------
const GATE_IN = [V(0.4, 43.2), V(0.8, 30), V(1.2, 14), V(0.6, 4)];
const COURTYARD_IN = V(0.6, 4);
const GROUPS = [
  [-8, -3], [7, -1], [-15, -9], [13, -12], [-3, 3], [16, 3], [-19, 2], [9, -17], [-11, -17], [19, -5],
  [-16, 18], [-20, 26], [-13, 29], [21, 14], [31, 16], [39, 13], [-30, 22], [-38, 26],
];
const COURT = { x0: -68, x1: -56, z0: -9, z1: 15 };
const PITCH = { x0: 74, x1: 96, z0: -54, z1: -6 };

// assembly: every class stands in its own pair of lines (boys and girls), facing the flag
const LINE_PITCH = 1.12;
const ROW_PITCH = 0.62;
// (an aisle down the middle, where the teachers walk)
const slotXZ = (cls, kind, row) => [-22.4 + (cls + 0.5) * LINE_PITCH + (cls < 20 ? -0.75 : 0.75) + (kind === 'boy' ? -0.27 : 0.27), -8.2 + row * ROW_PITCH];

export function createSim({ people, vehicles, grounds, scene, rng, onBell }) {
  const { pool, assembly, crowd } = people;
  const F = vehicles.fleet;
  const N = crowd.capacity;
  const CLASSES = CLASSROOMS.length;
  const perClass = Math.max(4, Math.floor(N / CLASSES));
  const busCap = Math.max(10, Math.round(N * 0.04));
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const randIn = (r) => V(r.x0 + rng() * (r.x1 - r.x0), r.z0 + rng() * (r.z1 - r.z0));
  const route = (a, pts, o) => a.sys.route(a, pts, o);
  const release = (a) => a.sys.release(a);

  let minutes = DAY_START;
  let last = DAY_START;
  let phase = null;
  let gateOpen = 0;
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
  /** like later(), but if fn() reports failure (everyone's busy, or the road isn't clear) it tries again shortly */
  const soon = (sec, fn, tries = 160) => later(sec, () => fn() || (tries > 0 && soon(0.25, fn, tries - 1)));
  /** a vehicle sets off along a route once its starting spot on the road is clear */
  const setOff = (d, path, opts) => soon(0, () => (vehicles.clearAt(path[0][0], path[0][1], 12) ? (d.drive(path, opts), true) : false));

  // ---------- getting about the building ----------
  /** from wherever the student is, through the courtyard and up to the classroom door */
  const goToClass = (a, cls, from = [], opts = {}) => {
    const room = CLASSROOMS[cls];
    const st = STAIRS[room.stair];
    if (room.floor === 0) {
      route(a, [...from, V(st.via[0], st.via[1]), V(room.front[0], room.front[1]), V(room.door[0], room.door[1], room.y)], { ...opts, onArrive: release });
      return;
    }
    route(a, [...from, V(st.via[0], st.via[1]), V(st.ground[0], st.ground[1]), V(st.base[0], st.base[1], FEET.corridor)], {
      ...opts,
      onArrive: (b) => {
        // up the stairs, then along the corridor to the classroom
        b.pos.set(st.base[0], room.y, st.base[1]);
        route(b, [V(room.corr[0], room.corr[1], room.y), V(room.door[0], room.door[1], room.y)], { pace: opts.pace, onArrive: release });
      },
    });
  };
  /** a student comes out of a classroom and down to the courtyard, then carries on with next(agent) */
  const leaveClass = (cls, opts, next) => {
    const room = CLASSROOMS[cls];
    const st = STAIRS[room.stair];
    const door = V(room.door[0], room.door[1], room.y);
    if (room.floor === 0) return crowd.spawn([door, V(room.front[0], room.front[1])], { ...opts, jitterStart: false, onArrive: (b) => next(b) });
    return crowd.spawn([door, V(room.corr[0], room.corr[1], room.y), V(st.base[0], st.base[1], room.y)], {
      ...opts,
      jitterStart: false,
      onArrive: (b) => {
        b.pos.set(st.base[0], FEET.corridor, st.base[1]); // down the stairs
        route(b, [V(st.ground[0], st.ground[1])], { pace: opts.pace, onArrive: (c) => next(c) });
      },
    });
  };

  // ---------- the assembly lines ----------
  let rowsTaken = [];
  let lineAgents = [];
  const resetLines = () => {
    rowsTaken = Array.from({ length: CLASSES }, () => ({ boy: 0, girl: 0 }));
    lineAgents = [];
  };
  resetLines();
  const takeSlot = (cls, kind) => {
    const row = rowsTaken[cls][kind]++;
    const [x, z] = slotXZ(cls, kind, row);
    return { x, z, row };
  };
  const standInLine = (a, cls, slot) => {
    a.tag = 'line';
    a.data = { cls, row: slot.row };
    route(a, [], { wait: 1e9, face: Math.PI });
    a.pos.set(slot.x, FEET.ground, slot.z);
    a.heading = Math.PI;
    lineAgents.push(a);
  };
  /** walk from wherever the student is to their place in the class line */
  const walkToLine = (a, cls, via = []) => {
    const slot = takeSlot(cls, a.kind);
    a.tag = 'toLine';
    a.data = { cls, row: slot.row };
    route(a, [...via, V(slot.x, slot.z + 0.6), V(slot.x, slot.z)], {
      pace: 1.2,
      run: a.run,
      onArrive: (b) => {
        b.tag = 'line';
        route(b, [], { wait: 1e9, face: Math.PI });
        lineAgents.push(b);
      },
    });
  };

  // ---------- morning arrivals ----------
  const arriveToSchool = (start, via, bag = true) => {
    const cls = Math.floor(rng() * CLASSES);
    const a = crowd.spawn([start, ...via], {
      bag,
      pace: 1.25,
      tag: 'arriving',
      onArrive: (b) => {
        // late for assembly: straight to the line, bag and all
        if (minutes >= hm(7, 58) && minutes < hm(8, 28)) walkToLine(b, cls, []);
        else goToClass(b, cls, [], { pace: 1.25 });
      },
    });
    if (a) a.data = { cls };
    return a;
  };
  const walkerFrom = (side) => [V(side * (12 + rng() * 48), 44.9 + rng() * 0.9), [V(side * 2.4, 45.0), ...GATE_IN]];

  let walkSchedule = [];
  const buildWalkSchedule = (fromMinute) => {
    const walkers = N - busCap * F.buses.length - AUTO_SEATS * F.autos.length;
    const list = [];
    for (let i = 0; i < walkers; i++) {
      // most come between 7:25 and 7:45
      const u = (rng() + rng() + rng()) / 3;
      const t = hm(7, 16) + u * 24;
      if (t >= fromMinute) list.push(t);
    }
    walkSchedule = list.sort((x, y) => y - x); // popped from the end, earliest first
  };

  // ---------- vehicles ----------
  const busArrive = (i) => {
    const b = F.buses[i];
    b.slot = busSlot(i);
    b.load = 0;
    b.expected = 0;
    b.boarding = false;
    setOff(b, busIn(b.slot), {
      max: 7,
      onEnd: () => {
        b.unload = busCap;
        b.unloadTimer = 1.2;
      },
    });
  };
  const busDepart = (i) => {
    const b = F.buses[i];
    if (!b.obj.visible || b.active) return;
    b.boarding = false;
    b.departAt = null;
    // anyone still on the way to this bus has missed it, and walks home instead
    for (const a of crowd.agents) if (a.active && a.tag === 'toBus' && a.data?.bus === i) walkHome(a);
    b.drive(busOut(b.slot), { max: 8, onEnd: () => (b.obj.visible = false) });
  };
  const parkBus = (i) => {
    const b = F.buses[i];
    b.slot = busSlot(i);
    b.drive(busIn(b.slot));
    b.s = b.len;
    b.active = false;
    b.place();
    b.unload = 0;
  };
  const STAFF_ROOM = [V(-14, -4), V(-25.4, -3), V(-27.8, -3, FEET.corridor)];
  const carArrive = (i) => {
    const c = F.cars[i];
    setOff(c, carIn(CAR_SLOTS[i]), {
      max: 9,
      onEnd: () => pool.spawn([V(CAR_SLOTS[i] - 1, 36.4), V(-8, 33), V(-1.4, 26), V(-1, 12), ...STAFF_ROOM], { teacher: true, onArrive: release }),
    });
  };
  const carDepart = (i) => {
    const c = F.cars[i];
    if (!c.obj.visible || c.active) return;
    // back out of the bay, then drive off — one car moving in the car park at a time
    const go = () =>
      soon(0, () => {
        if (F.cars.some((o) => o !== c && o.active && o.obj.position.z < 46)) return false;
        c.drive(carBackOut(CAR_SLOTS[i]), { max: 2.2, reverse: true, onEnd: () => c.drive(carOut(CAR_SLOTS[i]), { max: 9, onEnd: () => (c.obj.visible = false) }) });
        return true;
      });
    // the teacher comes out of the office block and walks to the car
    const t = pool.spawn([V(-9, 28), V(-9, 33), V(CAR_SLOTS[i] + 1.4, 36.2)], {
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
  /** an auto comes to the gate: in the morning it drops children, in the afternoon it waits for its riders */
  const autoRun = (i, dropping) => {
    const a = F.autos[i];
    a.load = 0;
    a.dropping = dropping;
    a.boarding = false;
    setOff(a, autoIn, {
      max: 8,
      onEnd: () => {
        a.stopped = true;
        a.waitT = 0;
        if (dropping) {
          for (let k = 0; k < AUTO_SEATS; k++) later(0.4 + k * 0.6, () => arriveToSchool(V(a.obj.position.x - 0.6 + k * 0.4, 46.0), [V(-2.6, 44.8), ...GATE_IN]));
          a.leaveIn = 4.5;
        }
      },
    });
  };
  const autoLeave = (a) => {
    a.stopped = false;
    a.drive(autoOut, { max: 8, onEnd: () => (a.obj.visible = false) });
  };

  // ---------- going home ----------
  const autoWaiting = []; // children on the footpath waiting for an auto
  let autoRiders = 0;
  const walkHome = (a, from = []) => {
    const side = rng() < 0.5 ? -1 : 1;
    a.tag = 'walkHome';
    const inside = a.pos.z < 43;
    route(a, [...from, ...(inside ? [V(0.8, Math.max(30, Math.min(a.pos.z, 40))), V(0.4, 43.2)] : []), V(side * 2.4, 45.0), V(side * (30 + rng() * 40), 45.0 + rng() * 0.8)], { pace: 1.3, onArrive: release });
  };
  const goHome = (a) => {
    const r = rng();
    const busesOpen = F.buses.filter((b) => b.boarding && b.obj.visible && !b.active);
    if (r < 0.17 && busesOpen.length) {
      // the bus with the fewest children so far
      const bus = busesOpen.reduce((m, b) => (b.expected < m.expected ? b : m), busesOpen[0]);
      bus.expected++;
      const s = bus.slot;
      a.tag = 'toBus';
      a.data = { bus: F.buses.indexOf(bus) };
      route(a, [COURTYARD_IN, V(1.4, 14), V(2.6, 24), V(3.6, busAisle(s)), V(s.x - 3.3, busAisle(s)), busDoor(s)], {
        pace: 1.3,
        onArrive: (b) => {
          if (bus.boarding) bus.load++;
          release(b);
        },
      });
      return;
    }
    if (r < 0.2 && autoRiders < AUTO_SEATS * F.autos.length) {
      autoRiders++;
      a.tag = 'toAuto';
      const spot = V(AUTO_STOP[0] - 3 + rng() * 5, 45.1 + rng() * 0.7);
      route(a, [COURTYARD_IN, V(1.2, 14), V(0.8, 30), V(0.4, 43.2), V(-2.4, 45.0), spot], {
        pace: 1.25,
        onArrive: (b) => {
          b.tag = 'waitAuto';
          route(b, [], { wait: 1e9, face: 0 });
          autoWaiting.push(b);
        },
      });
      return;
    }
    // walking home, left or right along the road
    walkHome(a, [COURTYARD_IN, V(1.2, 14)]);
  };

  // ---------- other parts of the day ----------
  const groupSpot = () => {
    const [cx, cz] = pick(GROUPS);
    const ang = rng() * Math.PI * 2;
    const rad = 0.8 + rng() * 1.4;
    const x = cx + Math.cos(ang) * rad;
    const z = cz + Math.sin(ang) * rad;
    return { p: V(x, z), face: Math.atan2(cx - x, cz - z) }; // facing the middle of the group
  };
  const mingle = (a) => {
    const g = groupSpot();
    route(a, [g.p], { wait: 6 + rng() * 14, face: g.face, pace: 0.9, onArrive: (b) => b.tag === 'lunch' && mingle(b) });
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
  const PE_CLASS = 7;
  const TO_TRACK = [V(14, -12), V(30, -12), V(46, -12), V(62, -14)];
  const corridorWalker = () => {
    const routes = [
      [V(6, -26.2, FL[1] + 0.03), V(27.5, -26.2, FL[1] + 0.03)],
      [V(-27.5, -26.2, FL[2] + 0.03), V(-6, -26.2, FL[2] + 0.03)],
      [V(-28.2, -22, FL[1] + 0.03), V(-28.2, 6, FL[1] + 0.03)],
      [V(28.2, 6, FL[2] + 0.03), V(28.2, -22, FL[2] + 0.03)],
      [V(-28.2, 5, FEET.corridor), V(-28.2, -21, FEET.corridor)],
      [V(28.2, -21, FEET.corridor), V(28.2, 5, FEET.corridor)],
    ];
    const r = pick(routes);
    if (rng() < 0.5) r.reverse();
    pool.spawn(r, { teacher: true, tag: 'corridor', onArrive: release });
  };

  // football and its ball
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5 }));
  ball.castShadow = true;
  ball.visible = false;
  scene.add(ball);
  const ballState = { pos: new THREE.Vector3(85, 0.12, -30), vel: new THREE.Vector3(), area: PITCH, players: [] };
  const kickOff = new THREE.Vector3();
  const playFootball = (n) => {
    ball.visible = true;
    ballState.pos.set(85, 0.12, -30);
    ballState.vel.set(0, 0, 0);
    ballState.players = [];
    for (let i = 0; i < n; i++) {
      const a = pool.spawn([V(26.4, -12, FEET.corridor), V(30, -12), V(60, -12), randIn(PITCH)], { teacher: false, tag: 'football' });
      if (a) ballState.players.push(a);
    }
  };
  /** everyone matching goes back into the east wing */
  const sendIn = (filter, via = V(30, -12)) => {
    for (const list of [pool.agents, crowd.agents]) {
      for (const a of list) {
        if (!a.active || !filter(a)) continue;
        a.tag = 'leaving';
        route(a, [via, V(26.4, -12, FEET.corridor)], { pace: 1.2, onArrive: release });
      }
    }
  };
  const stopFootball = () => {
    ball.visible = false;
    ballState.players = [];
    sendIn((a) => a.tag === 'football');
  };

  // ---------- the timetable ----------
  const ringBell = (name) => onBell?.(name);
  const EVENTS = [
    [hm(7, 16), () => carArrive(0)], [hm(7, 19), () => carArrive(1)], [hm(7, 23), () => carArrive(2)],
    [hm(7, 16.5), () => busArrive(0)], [hm(7, 19.5), () => busArrive(1)], [hm(7, 22.5), () => busArrive(2)], [hm(7, 25.5), () => busArrive(3)],
    ...F.autos.map((_, i) => [hm(7, 22) + i * 4.5, () => autoRun(i, true)]),
    [hm(7, 58), () => ringBell('Assembly')], [hm(8, 28), () => ringBell('Classes')], [hm(12, 30), () => ringBell('Lunch break')],
    [hm(12, 54), () => {
      ringBell('Lunch is over');
      endLunch();
    }],
    [hm(13, 10), () => ringBell('Classes')], [hm(15, 20), () => ringBell('Home time')],
    [hm(15, 20.5), () => F.buses.forEach((b, i) => {
      if (!b.obj.visible) return;
      b.boarding = true;
      b.departAt = hm(15, 34) + i * 1.5; // a bus leaves once its children are on board
    })],
    ...F.autos.map((_, i) => [hm(15, 21) + i * 1.2, () => autoRun(i, false)]),
    [hm(16, 8), () => carDepart(0)], [hm(16, 13), () => carDepart(1)], [hm(16, 18), () => carDepart(2)],
  ];

  /** fill class lines straight away (when the day jumps into the middle of assembly) */
  const fillLines = (share) => {
    for (let c = 0; c < CLASSES; c++) {
      for (let k = 0; k < Math.round(perClass * share); k++) {
        const a = crowd.spawn([V(0, 0)], { jitterStart: false });
        if (!a) return;
        standInLine(a, c, takeSlot(c, a.kind));
      }
    }
  };

  // ---------- phase changes ----------
  const enter = (p, fresh = true, m = minutes) => {
    assembly.setLeaders(p.id === 'assembly' || p.id === 'gather');
    const progress = Math.max(0, Math.min(1, (m - p.from) / (p.to - p.from)));
    if (p.id === 'arrival') buildWalkSchedule(m);
    if (p.id === 'gather') {
      // every class comes down; on a jump, part of the school is already standing in line
      const already = fresh ? 0 : Math.min(1, progress * 1.2);
      fillLines(already);
      for (let c = 0; c < CLASSES; c++) {
        const start = rng() * 9;
        const remaining = perClass - Math.round(perClass * already);
        for (let k = 0; k < remaining; k++) {
          soon(start + k * 0.42, () => {
            const a = leaveClass(c, { pace: 1.2, tag: 'toLine' }, (b) => walkToLine(b, c, [V(STAIRS[CLASSROOMS[c].stair].via[0] * 0.7, -5)]));
            if (a) a.data = { cls: c };
            return a;
          });
        }
      }
      // anyone still walking in (on the ground) is late: straight to their line, bag and all
      for (const a of crowd.agents) {
        if (a.active && a.tag === 'arriving' && a.pos.y < 0.3 && a.data) walkToLine(a, a.data.cls, []);
      }
    }
    if (p.id === 'assembly') {
      if (!fresh) fillLines(1);
      // the PT teacher walks down the middle aisle and back
      pool.spawn([V(0, -9.6), V(0, -0.2), V(0.3, -9.4)], { teacher: true, tag: 'aisle', onArrive: release, pace: 0.8 });
      // anyone still on the way hurries
      for (const a of crowd.agents) if (a.active && a.tag === 'toLine') a.run = true;
    }
    if (p.id === 'toclass') {
      if (!fresh) fillLines(Math.max(0, 1 - progress * 1.3));
      // the lines break up from the back; each class goes back up to its room
      const maxRow = lineAgents.reduce((mr, a) => Math.max(mr, a.data?.row ?? 0), 0);
      for (const a of lineAgents) {
        if (!a.active || a.tag !== 'line') continue;
        const { cls, row } = a.data;
        a.tag = 'toClass';
        later((maxRow - row) * 1.6 + rng() * 1.2, () => a.active && goToClass(a, cls, [], { pace: 1.15 }));
      }
      for (const a of crowd.agents) if (a.active && (a.tag === 'toLine' || a.tag === 'arriving')) goToClass(a, a.data?.cls ?? 0, [], { pace: 1.3 });
      lineAgents = [];
    }
    if (p.id === 'classes') {
      // a PE class comes down to the track and runs laps
      for (let k = 0; k < perClass; k++) {
        const lapAt = (k * 2) % trackLap.length;
        if (!fresh) {
          const a = crowd.spawn([trackLap[lapAt]], { jitterStart: false, tag: 'pe' });
          if (a) jog(a, (lapAt + 1) % trackLap.length);
          continue;
        }
        soon(k * 0.45, () => leaveClass(PE_CLASS, { pace: 1.2, tag: 'pe' }, (b) => route(b, [...TO_TRACK, trackLap[lapAt]], { pace: 1.3, onArrive: (c) => c.tag === 'pe' && jog(c, (lapAt + 1) % trackLap.length) })));
      }
      pool.spawn([V(26.4, -12, FEET.corridor), V(30, -12), V(66, -30)], { teacher: true, tag: 'peTeacher', wait: 9999, face: Math.PI / 2 });
    }
    if (p.id === 'lunch') {
      const out = Math.round(N * 0.38);
      if (!fresh && m < hm(12, 54)) {
        for (let k = 0; k < out; k++) {
          const g = groupSpot();
          const a = crowd.spawn([g.p], { jitterStart: false, tag: 'lunch', wait: rng() * 12, face: g.face });
          if (!a) break;
          a.heading = g.face;
          a.data = { cls: Math.floor(rng() * CLASSES) };
          a.onArrive = (b) => b.tag === 'lunch' && mingle(b);
        }
      } else if (fresh) {
        for (let k = 0; k < out; k++) {
          const c = Math.floor(rng() * CLASSES);
          soon(rng() * 16, () => {
            const a = leaveClass(c, { pace: 1.1, tag: 'lunch' }, (b) => b.tag === 'lunch' && mingle(b));
            if (a) a.data = { cls: c };
            return a;
          });
        }
      }
      for (let i = 0; i < 6; i++) {
        const a = pool.spawn([V(-26.4, 2, FEET.corridor), V(-40, 6), randIn(COURT)], { teacher: false, tag: 'basket' });
        if (a) runAround(a, COURT, 'basket');
      }
    }
    if (p.id === 'classes2') playFootball(8);
    if (p.id === 'home') {
      // every class empties out, bags on, a few seconds apart
      const gone = fresh ? 0 : Math.min(1, progress * 1.8);
      for (let c = 0; c < CLASSES; c++) {
        const start = rng() * 22;
        const remaining = Math.round(perClass * (1 - gone));
        for (let k = 0; k < remaining; k++) soon(start + k * 0.38, () => leaveClass(c, { pace: 1.25, bag: true, tag: 'home' }, goHome));
      }
      // jumped in after the autos were due: send them now
      if (!fresh && m > hm(15, 21) && m < hm(15, 48)) F.autos.forEach((_, i) => later(i * 2.5, () => autoRun(i, false)));
    }
    if (p.id === 'evening') later(4, () => playFootball(6));
  };
  /** lunch is over: everyone back up to class (a few seconds apart) */
  const endLunch = () => {
    for (const a of crowd.agents) {
      if (!a.active || a.tag !== 'lunch') continue;
      a.tag = 'toClass';
      const cls = a.data?.cls ?? Math.floor(rng() * CLASSES);
      later(rng() * 4, () => a.active && goToClass(a, cls, [], { pace: 1.25 }));
    }
    sendIn((a) => a.tag === 'basket', V(-40, 6));
  };
  const exit = (p) => {
    if (p.id === 'classes') sendIn((a) => a.tag === 'pe' || a.tag === 'peTeacher');
    if (p.id === 'lunch') endLunch();
    if (p.id === 'classes2' || p.id === 'evening') stopFootball();
  };

  /** put everything where it would be at this time of day */
  const resetTo = (m) => {
    minutes = last = m;
    queue = [];
    walkSchedule = [];
    autoWaiting.length = 0;
    autoRiders = 0;
    pool.releaseAll();
    crowd.releaseAll();
    resetLines();
    ball.visible = false;
    ballState.players = [];
    F.buses.forEach((b, i) => {
      b.active = false;
      b.boarding = false;
      b.unload = 0;
      b.load = 0;
      b.expected = 0;
      b.departAt = null;
      const arrive = hm(7, 16.5) + i * 3 + 16;
      const leave = hm(15, 46) + i * 2.5;
      if (m > arrive && m < leave) {
        parkBus(i);
        if (m > hm(15, 20.5)) {
          b.boarding = true;
          b.departAt = hm(15, 34) + i * 1.5;
        }
      } else {
        b.obj.visible = false;
        // it would be on its way in right now: send it
        if (m > hm(7, 16.5) + i * 3 && m <= arrive) later(i * 2.5, () => busArrive(i));
      }
    });
    F.cars.forEach((c, i) => {
      c.active = false;
      const arrive = [hm(7, 16), hm(7, 19), hm(7, 23)][i] + 12;
      const leave = [hm(16, 8), hm(16, 13), hm(16, 18)][i];
      if (m > arrive && m < leave) parkCar(i);
      else {
        c.obj.visible = false;
        if (m > arrive - 12 && m <= arrive) later(i * 2, () => carArrive(i));
      }
    });
    F.autos.forEach((a) => {
      a.active = false;
      a.obj.visible = false;
      a.stopped = false;
      a.boarding = false;
      a.load = 0;
    });
    F.autos.forEach((_, i) => {
      const due = hm(7, 22) + i * 4.5;
      if (m > due && m < due + 8) later(i * 2, () => autoRun(i, true));
    });
    gateOpen = m >= hm(7, 16) && m < hm(17, 35) ? 1 : 0;
    grounds.setGate(gateOpen);
    phase = phaseAt(m);
    enter(phase, false, m);
  };

  let clockCb = null;
  let clockT = 0;
  resetTo(DAY_START);

  const busyList = [...F.buses, ...F.cars, ...F.autos];
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
        enter(p, true);
      }
      // delayed actions
      if (queue.length) {
        const due = [];
        queue = queue.filter((j) => ((j.t -= dt) <= 0 ? (due.push(j), false) : true));
        for (const j of due) j.fn();
      }

      // ---- students walking in from both sides of the road ----
      if (p.id === 'arrival') {
        let n = 0;
        while (walkSchedule.length && walkSchedule[walkSchedule.length - 1] <= minutes && n < 14) {
          walkSchedule.pop();
          const [start, via] = walkerFrom(rng() < 0.5 ? -1 : 1);
          arriveToSchool(start, via);
          n++;
        }
        if (minutes > hm(7, 18)) every('teacherIn', 7, dt, () => pool.spawn([V((rng() < 0.5 ? -1 : 1) * 20, 45.1), V(0, 45.0), ...GATE_IN, ...STAFF_ROOM], { teacher: true, onArrive: release }));
      }
      if (p.id === 'classes' || p.id === 'classes2') every('corridor', 3, dt, corridorWalker);
      if (p.id === 'evening') every('corridor', 7, dt, corridorWalker);

      // ---- buses unloading in the morning ----
      for (const b of F.buses) {
        if (b.unload > 0) {
          b.unloadTimer -= dt;
          if (b.unloadTimer <= 0) {
            b.unloadTimer = 0.32;
            const s = b.slot;
            if (arriveToSchool(busDoor(s), [V(s.x - 3.3, busAisle(s)), V(3.6, busAisle(s)), V(2.2, 22), V(1.2, 12), COURTYARD_IN])) b.unload--;
          }
        }
      }
      // ---- buses leave once their children are on board (one at a time through the gate) ----
      let driving = false;
      for (const o of F.buses) if (o.active && o.obj.visible && o.obj.position.z < 46) driving = true;
      if (!driving) {
        for (let i = 0; i < F.buses.length; i++) {
          const b = F.buses[i];
          if (!b.departAt || minutes < b.departAt || b.active) continue;
          const full = b.expected > 0 && b.load >= b.expected * 0.93 && b.load >= 3;
          if (full || minutes >= b.departAt + 22) {
            busDepart(i);
            break;
          }
        }
      }
      // ---- autos: drop and go in the morning; in the afternoon the front one fills up, then goes ----
      let front = null;
      for (const a of F.autos) {
        if (!a.stopped) continue;
        a.waitT += dt;
        if (a.dropping) {
          a.leaveIn -= dt;
          if (a.leaveIn <= 0) autoLeave(a);
          continue;
        }
        front = a;
      }
      if (front) {
        // children waiting on the footpath climb in, one by one
        if (front.load < AUTO_SEATS && autoWaiting.length && !front.boarding) {
          const kid = autoWaiting.shift();
          if (kid?.active && kid.tag === 'waitAuto') {
            front.boarding = true;
            const auto = front;
            route(kid, [V(auto.obj.position.x - 0.2, 46.25)], {
              pace: 1.2,
              onArrive: (b) => {
                auto.load++;
                auto.boarding = false;
                release(b);
              },
            });
          }
        }
        if (!front.boarding && (front.load >= AUTO_SEATS || (front.load > 0 && front.waitT > 30) || front.waitT > 60)) autoLeave(front);
      }
      if (autoWaiting.length && minutes > hm(15, 40) && !F.autos.some((a) => a.obj.visible && !a.dropping && (a.stopped || a.active))) {
        for (const kid of autoWaiting.splice(0)) if (kid.active) walkHome(kid);
      }
      // ---- road traffic waits while school vehicles turn at the gate ----
      let busy = false;
      for (const d of busyList) if ((d.active || d.stopped) && d.obj.visible && Math.abs(d.obj.position.x) < 16 && d.obj.position.z > 40) busy = true;
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
        }
        for (const a of bs.players) {
          if (!a.active || a.tag !== 'football') continue;
          if (!a.path || a.seg >= a.path.length || rng() < dt * 0.6) {
            if (a === nearest) kickOff.set(0, 0, 0);
            else kickOff.set((rng() - 0.5) * 14, 0, (rng() - 0.5) * 14);
            route(a, [V(bs.pos.x + kickOff.x, bs.pos.z + kickOff.z, 0.1)], { run: a === nearest || rng() < 0.6 });
          }
        }
        if (nearest && nd < 0.9) {
          const ang = rng() * Math.PI * 2;
          bs.vel.set(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(7 + rng() * 7);
        }
        ball.position.set(bs.pos.x, 0.12, bs.pos.z);
        ball.rotation.x += bs.vel.length() * dt * 2;
      }

      // ---- the gate slides open in the morning and shut at night (never on a vehicle) ----
      let vehicleAtGate = false;
      for (const d of busyList) if (d.obj.visible && d.active && d.obj.position.z > 36 && d.obj.position.z < 47 && Math.abs(d.obj.position.x) < 12) vehicleAtGate = true;
      const want = (minutes >= hm(7, 15) && minutes < hm(17, 35)) || vehicleAtGate || F.cars.some((c) => c.active) ? 1 : 0;
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
    /** numbers for the test page */
    debug() {
      return {
        lines: lineAgents.length,
        walkLeft: walkSchedule.length,
        autoWaiting: autoWaiting.length,
        queue: queue.length,
        tags: crowd.agents.reduce((h, a) => (a.active && (h[a.tag || '-'] = (h[a.tag || '-'] || 0) + 1), h), {}),
        buses: F.buses.map((b) => `${b.load}/${b.expected}`).join(' '),
        autos: F.autos.map((a) => `${a.load}${a.stopped ? 's' : ''}`).join(' '),
      };
    },
  };
}
