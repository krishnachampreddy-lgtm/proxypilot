import * as THREE from 'three';
import { CAMPUS } from './grounds.js';

/*
  The neighbourhood: two- to four-storey houses with painted plaster, chajjas over
  the windows, balconies, shops with rolling shutters on the main road, and black
  water tanks on every terrace — the view from any Indian school.
*/

const FH = 3.1;

function house(B, M, rng, x, z, facing, { detail = true, shop = false } = {}) {
  // facing: 0 = front faces -z, 1 = +z, 2 = -x, 3 = +x
  const w = 6 + rng() * 5;
  const d = 8 + rng() * 6;
  const floors = 1 + Math.floor(rng() * (shop ? 3 : 3.6));
  const H = floors * FH;
  const paint = M.town[Math.floor(rng() * M.town.length)];
  const trim = rng() < 0.5 ? 'white' : M.town[Math.floor(rng() * M.town.length)];
  const ry = [0, Math.PI, Math.PI / 2, -Math.PI / 2][facing];
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  // local (u across the front, v toward the back) -> world; front face at v = 0
  const at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  const put = (w2, h2, d2, key, u, y, v) => {
    const [px, pz] = at(u, v);
    B.box(w2, h2, d2, key, px, y, pz, { ry });
  };

  put(w + 0.2, 0.4, d + 0.2, 'plinth', 0, 0, d / 2);
  put(w, H, d, paint, 0, 0.4, d / 2);
  put(w + 0.3, 0.9, d + 0.3, paint, 0, H + 0.4, d / 2); // parapet
  put(w + 0.4, 0.1, d + 0.4, trim, 0, H + 1.3, d / 2);
  for (let f = 1; f < floors; f++) put(w + 0.08, 0.22, 0.1, trim, 0, 0.4 + f * FH - 0.12, -0.05);
  put(0.3, H, 0.1, trim, -w / 2 + 0.15, 0.4, -0.05);
  put(0.3, H, 0.1, trim, w / 2 - 0.15, 0.4, -0.05);

  const cols = Math.max(1, Math.round(w / 2.6));
  for (let f = 0; f < floors; f++) {
    const y0 = 0.4 + f * FH;
    if (f === 0 && shop) {
      // shop front: rolling shutter and a painted signboard
      put(w * 0.8, 2.5, 0.08, 'shutter', 0, y0, -0.04);
      put(w * 0.82, 0.6, 0.06, M.town[Math.floor(rng() * M.town.length)], 0, y0 + 2.55, -0.08);
      continue;
    }
    for (let i = 0; i < cols; i++) {
      const u = -w / 2 + (w / cols) * (i + 0.5);
      if (f === 0 && i === 0 && !shop) {
        put(1.0, 2.1, 0.06, rng() < 0.5 ? 'wood' : 'blueRail', u, y0, -0.03); // front door
        continue;
      }
      put(1.5, 1.4, 0.04, 'glassTown', u, y0 + 0.85, -0.02);
      put(1.7, 0.12, 0.1, trim, u, y0 + 0.75, -0.05);
      put(1.9, 0.08, 0.55, trim, u, y0 + 2.35, -0.27); // chajja
      if (detail) for (let b = 1; b < 9; b++) put(0.02, 1.2, 0.02, 'green', u - 0.65 + b * 0.145, y0 + 0.97, -0.07);
    }
    // a balcony on upper floors at the front
    if (f > 0 && detail && rng() < 0.45) {
      put(w * 0.6, 0.14, 1.1, 'concrete', 0, y0 - 0.02, -0.55);
      put(w * 0.6, 0.9, 0.05, 'blueRail', 0, y0 + 0.12, -1.08);
    }
  }
  // side windows
  if (detail) {
    for (let f = 0; f < floors; f++) {
      const [px, pz] = at(w / 2 + 0.02, d * 0.6);
      B.box(0.04, 1.1, 1.1, 'glassTown', px, 0.4 + f * FH + 1.0, pz, { ry });
    }
  }
  // steel rods left sticking out of the roof for a future floor
  if (rng() < 0.35) {
    for (const cu of [-w / 2 + 0.2, w / 2 - 0.2]) for (const cv of [0.2, d - 0.2]) {
      const [rx, rz] = at(cu, cv);
      for (let r = 0; r < 4; r++) B.box(0.025, 0.9 + rng() * 0.4, 0.025, 'darkMetal', rx + (r % 2) * 0.12, H + 0.4, rz + (r > 1 ? 0.12 : 0));
    }
  }
  // water tank(s), stair room, sometimes a dish
  const [tx, tz] = at((rng() - 0.5) * w * 0.4, d * 0.7);
  B.cyl(0.62, 1.15, 'tank', tx, H + 0.4, tz, 14);
  if (floors > 1 && rng() < 0.75) {
    const [mx, mz] = at(-w / 4, d * 0.35);
    B.box(2.2, 2.4, 2.6, paint, mx, H + 0.4, mz, { ry });
  }
  if (detail && rng() < 0.25) {
    const [sx, sz] = at(w / 3, d * 0.25);
    B.add(new THREE.CircleGeometry(0.35, 14), 'white', sx, H + 1.9, sz, { ry: ry + Math.PI, rx: -0.5 });
  }
}

/** Simple far-away blocks so the city carries on to the horizon. */
function farTown(B, M, rng) {
  for (let i = 0; i < 1400; i++) {
    const a = rng() * Math.PI * 2;
    const r = 330 + Math.pow(rng(), 0.7) * 520;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 7 + rng() * 9;
    const h = 3.5 + Math.floor(rng() * 4) * 3.1;
    const paint = M.townFar[Math.floor(rng() * M.townFar.length)];
    B.box(w, h, 7 + rng() * 9, paint, x, 0, z, { ry: rng() * 0.3 });
    if (rng() < 0.6) B.cyl(0.6, 1.1, 'tank', x, h, z, 8);
  }
}

export function buildTown(B, M, rng, quality) {
  farTown(B, M, rng);
  const many = quality === 'low' ? 0.5 : 1;
  const { x0, x1, z0, z1 } = CAMPUS;
  // shops and houses facing the main road
  for (let x = -330; x < 330; x += 8 + rng() * 5) {
    if (rng() > many) continue;
    house(B, M, rng, x, 65, 0, { shop: rng() < 0.55 });
  }
  // streets of houses behind, facing narrow lanes
  for (let p = 0; p < 3; p++) {
    const lane = 101 + p * 36;
    B.box(700, 0.04, 6, 'asphalt', 0, 0, lane);
    for (const side of [-1, 1]) {
      for (let x = -330; x < 330; x += 8 + rng() * 6) {
        if (rng() > 0.85 * many) continue;
        house(B, M, rng, x, lane + side * 4, side < 0 ? 1 : 0, { detail: p === 0 });
      }
    }
  }
  // left and right of the campus
  for (let z = z0 - 40; z < 40; z += 9 + rng() * 5) {
    for (let k = 0; k < 4; k++) {
      if (rng() > 0.8 * many) continue;
      house(B, M, rng, x0 - 12 - k * 16, z, 3, { detail: k < 1 });
      if (rng() > 0.8 * many) continue;
      house(B, M, rng, x1 + 12 + k * 16, z, 2, { detail: k < 1 });
    }
  }
  // behind the school
  for (let x = x0 - 60; x < x1 + 60; x += 9 + rng() * 6) {
    for (let k = 0; k < 4; k++) {
      if (rng() > 0.8 * many) continue;
      house(B, M, rng, x, z0 - 12 - k * 16, 1, { detail: k < 1 });
    }
  }
}
