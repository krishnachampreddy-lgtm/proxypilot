import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { frame, FL, ROOFY } from './school.js';
import { BLOCKS, CLASSROOMS, STAFF, HOD, ALL_ROOMS, DESK_ROWS, DESK_COLS, LIBRARY, FLOOR } from './rooms.js';
import { canvasTexture } from './util.js';

/*
  Inside the school: every classroom has rows of desk-benches facing a blackboard with the
  day's lesson on it, a teacher's table, ceiling fans and tube lights, charts on the back
  wall. The staff room has a long table, chairs and steel almirahs; the HOD's office a desk
  with a computer, visitors' chairs and files. Doors are real moving leaves that swing open
  when someone walks through, and fans turn while a class is in.
*/

const AISLE_V = 3.3;
const top = (f) => (f < 2 ? FL[f + 1] : ROOFY);

/** textures for the inside (drawn once) */
export function interiorMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const LESSONS = [
    ['Mathematics', 'Fractions', '3/4 + 1/8 = 7/8', 'HW: Ex 4.2, Q 1-6'],
    ['Science', 'Photosynthesis', '6CO2 + 6H2O → C6H12O6 + 6O2', 'Draw a leaf'],
    ['English', 'Tenses', 'She has finished her work.', 'Write 10 sentences'],
    ['Social Studies', 'The Mughal Empire', '1526  Battle of Panipat', 'Read p. 54-57'],
    ['Hindi', 'व्याकरण — संज्ञा', 'राम, दिल्ली, किताब', 'पाठ 5 पढ़ें'],
    ['Physics', 'Motion', 'v = u + at', 's = ut + ½at²'],
  ];
  const boards = LESSONS.map(([subj, topic, line, hw]) =>
    canvasTexture(1024, 410, (g, w, h) => {
      g.fillStyle = '#1f3b2d';
      g.fillRect(0, 0, w, h);
      // chalk dust smears
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(230,240,230,${0.02 + Math.random() * 0.04})`;
        g.beginPath();
        g.ellipse(Math.random() * w, Math.random() * h, 40 + Math.random() * 120, 8 + Math.random() * 20, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(245,245,235,0.92)';
      g.font = '600 46px "Comic Sans MS", "Segoe Print", cursive';
      g.fillText(new Date().toLocaleDateString('en-GB'), w - 300, 60);
      g.font = '700 58px "Comic Sans MS", "Segoe Print", cursive';
      g.fillText(subj, 50, 80);
      g.fillRect(50, 96, g.measureText(subj).width, 4);
      g.font = '600 50px "Comic Sans MS", "Segoe Print", cursive';
      g.fillText(topic, 50, 170);
      g.fillStyle = 'rgba(250,236,170,0.92)';
      g.fillText(line, 70, 250);
      g.fillStyle = 'rgba(245,245,235,0.85)';
      g.font = '500 42px "Comic Sans MS", "Segoe Print", cursive';
      g.fillText(hw, 50, 345);
    })
  );
  const poster = canvasTexture(512, 256, (g, w, h) => {
    const cols = ['#e2574c', '#f2b134', '#4fb06d', '#3c8dc5', '#8e6bbf', '#f07fa6'];
    g.fillStyle = '#f6f0de';
    g.fillRect(0, 0, w, h);
    // three charts on the back wall: an alphabet chart, a map, a periodic table
    for (let i = 0; i < 26; i++) {
      g.fillStyle = cols[i % cols.length];
      g.fillRect(8 + (i % 6) * 26, 14 + Math.floor(i / 6) * 46, 22, 40);
    }
    g.fillStyle = '#9ccbe8';
    g.fillRect(180, 10, 150, 236);
    g.fillStyle = '#7fb069';
    g.beginPath();
    g.moveTo(230, 40); g.lineTo(300, 60); g.lineTo(290, 140); g.lineTo(255, 220); g.lineTo(220, 150); g.lineTo(205, 80);
    g.fill();
    for (let r = 0; r < 7; r++) for (let c = 0; c < 9; c++) {
      if (r === 0 && c > 0 && c < 8) continue;
      g.fillStyle = cols[(r + c) % cols.length];
      g.fillRect(350 + c * 17, 20 + r * 30, 15, 27);
    }
  });
  const notice = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#b98a57';
    g.fillRect(0, 0, w, h);
    const papers = ['#ffffff', '#fff4b8', '#d9f0ff', '#ffe0e6', '#e2ffd9'];
    for (let i = 0; i < 9; i++) {
      g.save();
      g.translate(40 + (i % 5) * 96 + Math.random() * 10, 30 + Math.floor(i / 5) * 120 + Math.random() * 10);
      g.rotate((Math.random() - 0.5) * 0.15);
      g.fillStyle = papers[i % papers.length];
      g.fillRect(0, 0, 80, 100);
      g.fillStyle = 'rgba(40,40,60,0.55)';
      for (let l = 0; l < 7; l++) g.fillRect(8, 12 + l * 12, 40 + Math.random() * 25, 3);
      g.fillStyle = '#c0392b';
      g.beginPath();
      g.arc(40, 6, 4, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  });
  const books = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#5a3a22';
    g.fillRect(0, 0, w, h);
    const cols = ['#7a1f2b', '#1f3f7a', '#2f6a3a', '#b8862b', '#5a2f7a', '#2b6f7a', '#8a4a1f', '#c9c2b0', '#222222', '#a33c2b'];
    const shelfH = h / 5;
    for (let s = 0; s < 5; s++) {
      let x = 6;
      const y0 = s * shelfH;
      g.fillStyle = '#3b2616';
      g.fillRect(0, y0 + shelfH - 8, w, 8);
      while (x < w - 10) {
        const bw = 8 + Math.random() * 12;
        const bh = shelfH * (0.6 + Math.random() * 0.3);
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.fillRect(x, y0 + shelfH - 8 - bh, bw - 1.5, bh);
        g.fillStyle = 'rgba(255,230,160,0.5)';
        g.fillRect(x + 2, y0 + shelfH - 8 - bh * 0.7, bw - 5, 2);
        x += bw;
        if (Math.random() < 0.05) x += 14;
      }
    }
  });
  return {
    floorIn: null, // set from the tile texture by the caller
    deskWood: null,
    deskMetal: std({ color: '#2f3b4c', roughness: 0.5, metalness: 0.5 }),
    chalkboards: boards.map((map) => std({ map, roughness: 0.92 })),
    dado: std({ color: '#93b5a5', roughness: 0.85 }),
    tube: std({ color: '#ffffff', emissive: '#f2f8ff', emissiveIntensity: 1.4, roughness: 0.3 }),
    almirah: std({ color: '#7f8d86', roughness: 0.42, metalness: 0.55 }),
    poster: std({ map: poster, roughness: 0.8 }),
    notice: std({ map: notice, roughness: 0.9 }),
    books: std({ map: books, roughness: 0.85 }),
    screen: std({ color: '#0a1624', emissive: '#4a8fd8', emissiveIntensity: 0.9, roughness: 0.2 }),
    leather: std({ color: '#2a1d17', roughness: 0.55 }),
    fanWhite: std({ color: '#efece4', roughness: 0.4, metalness: 0.2 }),
  };
}

/** a frame helper for one room: (u, v) in its block, y from its floor */
function roomFrame(B, r) {
  const b = BLOCKS[r.block];
  return frame(B, b.ox, b.oz, b.theta);
}

/** one two-seater desk-bench: wooden top and seat on a steel frame; the student sits facing -u */
function deskBench(F, u, v, y) {
  F.box(0.42, 0.035, 1.05, 'deskWood', u - 0.25, y + 0.66, v); // desk top
  F.box(0.02, 0.3, 1.05, 'deskWood', u - 0.45, y + 0.36, v); // front panel
  F.box(0.3, 0.025, 0.98, 'deskWood', u - 0.24, y + 0.48, v); // book shelf
  F.box(0.28, 0.035, 1.05, 'deskWood', u + 0.17, y + 0.38, v); // seat
  for (const s of [-0.49, 0.49]) {
    F.box(0.035, 0.66, 0.035, 'deskMetal', u - 0.43, y, v + s); // front leg
    F.box(0.035, 0.38, 0.035, 'deskMetal', u + 0.28, y, v + s); // back leg
    F.box(0.74, 0.03, 0.035, 'deskMetal', u - 0.08, y + 0.04, v + s); // floor runner
  }
}

function chair(F, u, v, y, face = 0, key = 'deskWood') {
  // face: the way the person sits, as a rotation in the block frame (0 = facing +v)
  const c = Math.cos(face);
  const s = Math.sin(face);
  const at = (du, dv) => [u + du * c + dv * s, v - du * s + dv * c];
  let [a, b] = at(0, 0);
  F.box(0.44, 0.04, 0.42, key, a, y + 0.44, b, face);
  [a, b] = at(0, -0.2);
  F.box(0.44, 0.46, 0.04, key, a, y + 0.48, b, face);
  for (const [du, dv] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    [a, b] = at(du, dv);
    F.box(0.035, 0.44, 0.035, 'deskMetal', a, y, b, face);
  }
}

function fanBase(F, u, v, f) {
  const cy = top(f) - 0.2; // underside of the slab
  F.add(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 6), 'fanWhite', u, cy - 0.21, v);
  F.add(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 12), 'fanWhite', u, cy - 0.46, v);
  return { u, v, y: cy - 0.48, f };
}

function classroom(F, r, boardIdx) {
  const y = FL[r.floor] + 0.025;
  const { rc } = r;
  const u0 = rc - 3.6;
  const u1 = rc + 3.6;
  // dado (the painted lower band) on the inside of every wall
  F.box(6.9, 0.85, 0.012, 'dado', rc, y, 0.226);
  F.box(0.6 - 0.1, 0.9, 0.012, 'dado', u0 + 0.35, y, 6.374);
  F.box(u1 - 0.1 - (rc - 1.99), 0.9, 0.012, 'dado', (rc - 1.99 + u1 - 0.1) / 2, y, 6.374);
  F.box(0.012, 0.9, 6.0, 'dado', u0 + 0.106, y, AISLE_V);
  F.box(0.012, 0.9, 6.0, 'dado', u1 - 0.106, y, AISLE_V);
  // blackboard on the front wall, with a wooden frame and a chalk ledge
  F.box(0.05, 1.32, 3.24, 'deskWood', u0 + 0.12, y + 0.92, AISLE_V);
  F.box(0.03, 1.2, 3.1, 'chalk' + boardIdx, u0 + 0.155, y + 0.98, AISLE_V);
  F.box(0.1, 0.03, 3.1, 'deskWood', u0 + 0.18, y + 0.93, AISLE_V);
  // teacher's table and chair
  F.box(0.62, 0.04, 1.1, 'deskWood', rc - 2.1, y + 0.74, 1.35);
  F.box(0.6, 0.7, 0.03, 'deskWood', rc - 2.1, y + 0.04, 0.83);
  F.box(0.6, 0.7, 0.03, 'deskWood', rc - 2.1, y + 0.04, 1.87);
  F.box(0.03, 0.5, 1.06, 'deskWood', rc - 1.82, y + 0.24, 1.35);
  F.box(0.24, 0.05, 0.32, 'books', rc - 2.15, y + 0.78, 1.15); // register and chalk box
  chair(F, rc - 2.55, 1.35, y, Math.PI / 2);
  // desk-benches
  for (const ru of DESK_ROWS) for (const cv of DESK_COLS) deskBench(F, rc + ru, cv, y);
  // charts and a notice board on the back wall, a clock over the board
  F.box(0.02, 1.0, 2.0, 'poster', u1 - 0.12, y + 1.3, 2.2);
  F.box(0.02, 0.8, 1.2, 'notice', u1 - 0.12, y + 1.4, 4.7);
  F.add(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 20), 'fanWhite', u0 + 0.13, y + 2.55, AISLE_V, { rz: Math.PI / 2 });
  // tube lights on the ceiling
  const cy = top(r.floor) - 0.2;
  for (const u of [rc - 2.6, rc + 0.35, rc + 2.9]) {
    F.box(0.08, 0.04, 1.3, 'fanWhite', u, cy - 0.05, AISLE_V);
    F.box(0.045, 0.045, 1.22, 'tube', u, cy - 0.095, AISLE_V);
  }
}

function staffRoom(F, r) {
  const y = FL[r.floor] + 0.025;
  const { rc } = r;
  const tu = r.table.u;
  // long table with a green cloth top
  F.box(3.9, 0.05, 1.25, 'deskWood', tu, y + 0.74, AISLE_V);
  F.box(3.86, 0.012, 1.21, 'dado', tu, y + 0.79, AISLE_V);
  for (const du of [-1.85, 1.85]) for (const dv of [-0.55, 0.55]) F.box(0.06, 0.74, 0.06, 'deskMetal', tu + du, y, AISLE_V + dv);
  for (const [du, dv] of [[-1.2, -0.3], [-0.1, 0.25], [0.9, -0.2], [1.5, 0.3]]) F.box(0.3, 0.06, 0.22, 'books', tu + du, y + 0.79, AISLE_V + dv); // files and registers
  for (const du of [-1.25, -0.35, 0.55, 1.45]) {
    chair(F, tu + du, AISLE_V - 0.92, y, 0);
    chair(F, tu + du, AISLE_V + 0.92, y, Math.PI);
  }
  // steel almirahs along the back wall, notice board at the front
  for (const v of [1.0, 2.05, 4.55, 5.6]) {
    F.box(0.52, 1.95, 0.95, 'almirah', rc + 3.2, y, v);
    F.box(0.02, 1.8, 0.02, 'deskMetal', rc + 2.93, y + 0.08, v);
  }
  F.box(0.02, 1.2, 2.8, 'notice', rc - 3.47, y + 1.1, AISLE_V);
  F.box(6.9, 0.85, 0.012, 'dado', rc, y, 0.226);
  // a water filter on a stand by the door
  F.box(0.4, 0.9, 0.4, 'almirah', rc - 3.0, y, 5.7);
  F.add(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12), 'fanWhite', rc - 3.0, y + 1.15, 5.7);
  const cy = top(r.floor) - 0.2;
  for (const u of [rc - 0.8, rc + 1.6]) {
    F.box(0.08, 0.04, 1.3, 'fanWhite', u, cy - 0.05, AISLE_V);
    F.box(0.045, 0.045, 1.22, 'tube', u, cy - 0.095, AISLE_V);
  }
}

function hodOffice(F, r) {
  const y = FL[r.floor] + 0.025;
  const { rc } = r;
  // desk with a modesty panel, a computer, files and a name plate
  F.box(0.85, 0.05, 1.7, 'deskWood', rc + 1.35, y + 0.75, AISLE_V);
  F.box(0.04, 0.72, 1.66, 'deskWood', rc + 0.96, y + 0.03, AISLE_V);
  for (const dv of [-0.8, 0.8]) F.box(0.8, 0.75, 0.04, 'deskWood', rc + 1.35, y, AISLE_V + dv);
  F.box(0.04, 0.34, 0.56, 'screen', rc + 1.5, y + 0.95, AISLE_V + 0.62, -0.5);
  F.box(0.12, 0.16, 0.06, 'deskMetal', rc + 1.55, y + 0.8, AISLE_V + 0.62);
  F.box(0.16, 0.02, 0.44, 'deskMetal', rc + 1.3, y + 0.8, AISLE_V + 0.45);
  F.box(0.28, 0.12, 0.34, 'books', rc + 1.4, y + 0.8, AISLE_V - 0.5);
  F.box(0.06, 0.08, 0.3, 'board', rc + 1.05, y + 0.8, AISLE_V - 0.1);
  // the HOD's high-backed chair and two visitors' chairs
  F.box(0.5, 0.08, 0.5, 'leather', rc + 2.05, y + 0.46, AISLE_V);
  F.box(0.08, 0.8, 0.5, 'leather', rc + 2.3, y + 0.5, AISLE_V);
  F.box(0.06, 0.46, 0.06, 'deskMetal', rc + 2.05, y, AISLE_V);
  chair(F, rc + 0.25, AISLE_V - 0.55, y, Math.PI / 2);
  chair(F, rc + 0.25, AISLE_V + 0.55, y, Math.PI / 2);
  // cupboards with files, a notice board, the dado
  for (const v of [0.9, 1.9]) F.box(0.5, 1.95, 0.95, 'almirah', rc + 3.2, y, v);
  F.box(0.4, 2.0, 1.6, 'books', rc + 3.18, y, 4.9);
  F.box(0.02, 1.0, 2.0, 'notice', rc - 3.47, y + 1.2, AISLE_V);
  F.box(6.9, 0.85, 0.012, 'dado', rc, y, 0.226);
  const cy = top(r.floor) - 0.2;
  F.box(0.08, 0.04, 1.3, 'fanWhite', rc + 1.0, cy - 0.05, AISLE_V);
  F.box(0.045, 0.045, 1.22, 'tube', rc + 1.0, cy - 0.095, AISLE_V);
}

/** furniture inside the library building (built in grounds.js) */
export function furnishLibrary(B) {
  const { y, tables } = LIBRARY;
  const fy = y - 0.03;
  const out = [];
  // shelves along the back and side walls
  for (let x = -73.2; x <= -54.7; x += 2.3) B.box(2.1, 2.3, 0.45, 'books', x, fy, -49.95);
  for (const x of [-74.45, -53.55]) for (const z of [-48.2, -46.0]) B.box(0.45, 2.3, 2.1, 'books', x, fy, z);
  for (const [tx, tz] of tables) {
    B.box(2.6, 0.05, 1.0, 'deskWood', tx, fy + 0.74, tz);
    for (const dx of [-1.2, 1.2]) B.box(0.06, 0.74, 0.9, 'deskMetal', tx + dx, fy, tz);
    for (const side of [-1, 1]) {
      for (const dx of [-0.8, 0, 0.8]) {
        const z = tz + side * 0.72;
        B.box(0.42, 0.04, 0.42, 'deskWood', tx + dx, fy + 0.44, z);
        B.box(0.42, 0.44, 0.04, 'deskWood', tx + dx, fy + 0.48, z + side * 0.2);
        B.box(0.36, 0.44, 0.36, 'deskMetal', tx + dx, fy, z, { sx: 0.12 });
      }
    }
    B.box(0.3, 0.05, 0.22, 'books', tx - 0.4, fy + 0.79, tz - 0.1);
    B.box(0.22, 0.04, 0.3, 'books', tx + 0.7, fy + 0.79, tz + 0.12);
  }
  // the librarian's counter by the door
  const [dx, dz] = LIBRARY.desk;
  B.box(1.8, 0.95, 0.5, 'deskWood', dx, fy, dz);
  B.box(1.9, 0.05, 0.6, 'deskWood', dx, fy + 0.95, dz);
  B.box(0.04, 0.3, 0.45, 'screen', dx + 0.4, fy + 1.0, dz - 0.05, { ry: Math.PI / 2 });
  B.box(0.46, 0.04, 0.44, 'leather', LIBRARY.librarian.x, fy + 0.46, LIBRARY.librarian.z);
  // fans and lights
  for (const x of [-70, -58]) for (const z of [-47.6, -43]) {
    B.add(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 6), 'fanWhite', x, 4.48, z);
    B.add(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 12), 'fanWhite', x, 4.2, z);
    out.push({ x, y: 4.18, z });
  }
  for (const x of [-72, -66, -62, -56]) {
    B.box(1.3, 0.04, 0.08, 'fanWhite', x, 4.52, -45);
    B.box(1.22, 0.045, 0.045, 'tube', x, 4.475, -45);
  }
  return out;
}

/** Furniture for all rooms; returns the moving parts (fans) to animate. */
export function buildInteriors(B) {
  const fans = [];
  CLASSROOMS.forEach((r, i) => {
    const F = roomFrame(B, r);
    classroom(F, r, i % 6);
    for (const u of [r.rc - 1.1, r.rc + 1.8]) fans.push({ ...fanBase(F, u, AISLE_V, r.floor), room: i, F });
  });
  {
    const F = roomFrame(B, STAFF);
    staffRoom(F, STAFF);
    for (const u of [STAFF.rc - 1.0, STAFF.rc + 1.5]) fans.push({ ...fanBase(F, u, AISLE_V, STAFF.floor), room: 'staff', F });
  }
  {
    const F = roomFrame(B, HOD);
    hodOffice(F, HOD);
    fans.push({ ...fanBase(F, HOD.rc + 0.2, AISLE_V, HOD.floor), room: 'hod', F });
  }
  return fans;
}

/**
 * The moving parts: a door leaf for every room (swings into the room when someone comes
 * near, closes again behind them) and ceiling fan blades.
 */
export function createMovers(scene, M, fans, libraryFans) {
  // ---- doors ----
  const leafGeo = mergeGeometries([
    new THREE.BoxGeometry(1.0, 2.1, 0.045).translate(0.5, 1.05, 0),
    new THREE.BoxGeometry(0.8, 0.8, 0.012).translate(0.5, 1.55, 0.026), // raised panels
    new THREE.BoxGeometry(0.8, 0.8, 0.012).translate(0.5, 0.55, 0.026),
    new THREE.BoxGeometry(0.8, 0.8, 0.012).translate(0.5, 1.55, -0.026),
    new THREE.BoxGeometry(0.8, 0.8, 0.012).translate(0.5, 0.55, -0.026),
  ]);
  const handleGeo = mergeGeometries([
    new THREE.BoxGeometry(0.04, 0.16, 0.05).translate(0.88, 1.0, 0.05),
    new THREE.BoxGeometry(0.04, 0.16, 0.05).translate(0.88, 1.0, -0.05),
  ]);
  const doorWood = M.doorWood;
  const doors = ALL_ROOMS.map((r) => ({
    x: r.hinge[0],
    y: FL[r.floor],
    z: r.hinge[1],
    theta: r.theta,
    // the two points either side of the door, for "is anyone coming through?"
    px: r.door[0], pz: r.door[1], qx: r.inDoor[0], qz: r.inDoor[1],
    floor: r.floor,
    open: 0,
    want: 0,
    hold: 0,
    dirty: true,
  }));
  const leaves = new THREE.InstancedMesh(leafGeo, doorWood, doors.length);
  const handles = new THREE.InstancedMesh(handleGeo, M.steel, doors.length);
  for (const im of [leaves, handles]) {
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    scene.add(im);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const place = (d, i) => {
    q.setFromAxisAngle(up, d.theta + d.open * 1.75);
    m4.compose(pos.set(d.x, d.y, d.z), q, one);
    leaves.setMatrixAt(i, m4);
    handles.setMatrixAt(i, m4);
  };
  doors.forEach(place);

  // which doors are near a point: a coarse grid per floor
  const cell = (f, x, z) => `${f}:${Math.round(x / 3)}:${Math.round(z / 3)}`;
  const grid = new Map();
  doors.forEach((d, i) => {
    for (const [x, z] of [[d.px, d.pz], [d.qx, d.qz]]) {
      for (const ox of [-1.5, 0, 1.5]) for (const oz of [-1.5, 0, 1.5]) {
        const k = cell(d.floor, x + ox, z + oz);
        if (!grid.has(k)) grid.set(k, new Set());
        grid.get(k).add(i);
      }
    }
  });

  // ---- fans ----
  const bladeGeo = mergeGeometries(
    [0, 1, 2].map((k) => new THREE.BoxGeometry(0.62, 0.012, 0.11).translate(0.42, 0, 0).rotateY((k * Math.PI * 2) / 3))
  );
  const allFans = [
    ...fans.map((f) => {
      const [x, z] = f.F.at(f.u, f.v);
      return { x, y: f.y, z, room: f.room, a: Math.random() * 6, w: 0 };
    }),
    ...libraryFans.map((f) => ({ ...f, room: 'library', a: Math.random() * 6, w: 0 })),
  ];
  const blades = new THREE.InstancedMesh(bladeGeo, M.fanWhite, allFans.length);
  blades.frustumCulled = false;
  scene.add(blades);

  return {
    doors,
    /** people: lists of agents ({ active, pos }); busy(room) → is a fan's room in use */
    update(dt, lists, busy) {
      for (const d of doors) d.want = 0;
      for (const list of lists) {
        for (const a of list) {
          if (!a.active) continue;
          const y = a.pos.y;
          if (y < 0.3) continue;
          const f = Math.round((y - 0.48) / FLOOR);
          const near = grid.get(cell(f, a.pos.x, a.pos.z));
          if (!near) continue;
          for (const i of near) {
            const d = doors[i];
            const ax = a.pos.x;
            const az = a.pos.z;
            if ((ax - d.px) ** 2 + (az - d.pz) ** 2 < 1.8 || (ax - d.qx) ** 2 + (az - d.qz) ** 2 < 1.8) d.want = 1;
          }
        }
      }
      let changed = false;
      doors.forEach((d, i) => {
        if (d.want) d.hold = 1.4;
        else d.hold -= dt;
        const target = d.hold > 0 ? 1 : 0;
        if (d.open !== target) {
          d.open = target > d.open ? Math.min(1, d.open + dt * 2.2) : Math.max(0, d.open - dt * 1.1);
          place(d, i);
          changed = true;
        }
      });
      if (changed) {
        leaves.instanceMatrix.needsUpdate = true;
        handles.instanceMatrix.needsUpdate = true;
      }
      // fans spin up while their room is in use
      allFans.forEach((f, i) => {
        const want = busy(f.room) ? 11 : 0;
        f.w += (want - f.w) * Math.min(1, dt * 0.6);
        f.a += f.w * dt;
        q.setFromAxisAngle(up, f.a);
        m4.compose(pos.set(f.x, f.y, f.z), q, one);
        blades.setMatrixAt(i, m4);
      });
      blades.instanceMatrix.needsUpdate = true;
    },
    /** open every door straight away (testing) */
    setAll(v) {
      doors.forEach((d, i) => {
        d.open = v;
        d.hold = v ? 99 : 0;
        place(d, i);
      });
      leaves.instanceMatrix.needsUpdate = true;
      handles.instanceMatrix.needsUpdate = true;
    },
  };
}
