/*
  Classrooms on the campus, in the order they're handed out to class names
  (the ones you can see best from the courtyard first). Each has the point in
  front of its corridor-side windows and the direction it faces.
  No 3D code here, so the page can use it too.
*/

const PLINTH = 0.45;
const FLOOR = 3.6;
const CD = 6.6; // classroom depth (block depth 9 minus the 2.4 m corridor)
const floorY = (f) => PLINTH + FLOOR * f;
const FLOOR_NAME = ['Ground floor', 'First floor', 'Second floor'];

function room(block, rc, f) {
  const u = rc + 0.8; // between the two windows
  let x, z, nx, nz;
  if (block === 'A') [x, z, nx, nz] = [u, -34 + CD, 0, 1]; // back block, faces the courtyard (+z)
  else if (block === 'B') [x, z, nx, nz] = [-36 + CD, -8.5 - u, 1, 0]; // left wing, faces +x
  else [x, z, nx, nz] = [36 - CD, -8.5 + u, -1, 0]; // right wing, faces -x
  const wing = { A: 'Main block', B: 'West wing', C: 'East wing' }[block];
  return { block, floor: f, x, y: floorY(f) + 1.57, z, nx, nz, where: `${wing} · ${FLOOR_NAME[f]}` };
}

const PREFERRED = [
  ['A', -10.8, 1], ['A', 10.8, 1], ['A', -18, 0], ['A', 18, 0], ['A', -10.8, 2], ['A', 10.8, 2],
  ['B', 1.5, 1], ['C', 1.5, 1], ['A', -25.2, 1], ['A', 25.2, 1], ['B', -12.9, 0], ['C', -12.9, 0],
  ['A', -18, 2], ['A', 18, 2], ['B', 8.7, 1], ['C', 8.7, 1], ['A', -25.2, 0], ['A', 25.2, 0],
];

export const ROOMS = (() => {
  const list = PREFERRED.map(([b, rc, f]) => room(b, rc, f));
  const seen = new Set(PREFERRED.map((p) => p.join()));
  for (const [b, rcs] of [['A', [-25.2, -18, -10.8, 10.8, 18, 25.2]], ['B', [-12.9, -5.7, 1.5, 8.7]], ['C', [-12.9, -5.7, 1.5, 8.7]]]) {
    for (const rc of rcs) {
      for (let f = 0; f < 3; f++) {
        if (b === 'B' && rc === -5.7 && f === 0) continue; // that's the staff room
        if (!seen.has([b, rc, f].join())) list.push(room(b, rc, f));
      }
    }
  }
  return list;
})();

/** the same class always gets the same room: rooms are handed out in sorted class-name order */
export function roomFor(className, allClasses) {
  const sorted = [...new Set(allClasses)].sort();
  const i = sorted.indexOf(className);
  return ROOMS[(i >= 0 ? i : sorted.length) % ROOMS.length];
}

// ---------------- getting around the building ----------------
// Staircases: where students leave the ground floor (`ground`, in the courtyard),
// the foot of the stairs inside the corridor (`base`), and the same spot on each floor.
const G = 0.08; // feet on the paving
const V0 = PLINTH + 0.03; // feet on a corridor floor
export const STAIRS = [
  { id: 'A-west', base: [-5.2, -26.2], ground: [-5.6, -23.4], via: [-9, -9] },
  { id: 'A-east', base: [5.2, -26.2], ground: [5.6, -23.4], via: [9, -9] },
  { id: 'NW', base: [-28.2, -26.2], ground: [-25.4, -23.6], via: [-14, -12] },
  { id: 'NE', base: [28.2, -26.2], ground: [25.4, -23.6], via: [14, -12] },
  { id: 'W-front', base: [-28.2, 6.6], ground: [-25.4, 6.4], via: [-12, 5] },
  { id: 'E-front', base: [28.2, 6.6], ground: [25.4, 6.4], via: [12, 5] },
];

/** classroom doors and the nearest staircase for every room */
function withDoor(r, rc) {
  const du = rc - 2.5; // the door is 2.5 m before the room centre along the block
  const f = r.floor;
  const y = f === 0 ? V0 : floorY(f) + 0.03;
  let door, corr, front, stair;
  if (r.block === 'A') {
    door = [du, -34 + CD + 0.35];
    corr = [du, -26.2];
    front = [du, -23.6];
    stair = du < 0 ? (du > -16 ? 0 : 2) : du < 16 ? 1 : 3;
  } else if (r.block === 'B') {
    door = [-36 + CD + 0.35, -8.5 - du];
    corr = [-28.2, -8.5 - du];
    front = [-25.6, -8.5 - du];
    stair = corr[1] < -10 ? 2 : 4;
  } else {
    door = [36 - CD - 0.35, -8.5 + du];
    corr = [28.2, -8.5 + du];
    front = [25.6, -8.5 + du];
    stair = corr[1] < -10 ? 3 : 5;
  }
  return { ...r, rc, y, door, corr, front, stair };
}

// rooms in the same order as ROOMS (so a class keeps its room), with doors added
const RC = (() => {
  const out = [];
  for (const [b, rc, f] of PREFERRED) out.push([b, rc, f]);
  const seen = new Set(PREFERRED.map((p) => p.join()));
  for (const [b, rcs] of [['A', [-25.2, -18, -10.8, 10.8, 18, 25.2]], ['B', [-12.9, -5.7, 1.5, 8.7]], ['C', [-12.9, -5.7, 1.5, 8.7]]]) {
    for (const rc of rcs) for (let f = 0; f < 3; f++) {
      if (b === 'B' && rc === -5.7 && f === 0) continue;
      if (!seen.has([b, rc, f].join())) out.push([b, rc, f]);
    }
  }
  return out;
})();

/** the 40 classrooms the school day uses */
export const CLASSROOMS = ROOMS.slice(0, 40).map((r, i) => withDoor(r, RC[i][1]));
export const FEET = { ground: G, corridor: V0, floor: (f) => (f === 0 ? V0 : floorY(f) + 0.03) };
