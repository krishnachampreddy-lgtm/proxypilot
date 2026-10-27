/*
  The school day timetable, shared by the 3D campus and the page around it
  (this file has no 3D code, so the page can use it without loading three.js).
  `speed` is campus minutes per real second: busy moments play close to real time,
  lessons fast-forward, so a whole day takes about eight minutes.
*/

const hm = (h, m = 0) => h * 60 + m;

export const PHASES = [
  { id: 'arrival', label: 'Morning arrival', from: hm(7, 15), to: hm(7, 58), speed: 0.25, jump: hm(7, 15), now: 'Students arrive with their bags and go up to their classrooms' },
  { id: 'gather', label: 'Assembly bell', from: hm(7, 58), to: hm(8, 10), speed: 0.22, jump: hm(7, 57), now: 'Every class comes down and lines up in the courtyard' },
  { id: 'assembly', label: 'Assembly', from: hm(8, 10), to: hm(8, 28), speed: 0.75, jump: hm(8, 10), now: 'Morning assembly — the whole school in class lines' },
  { id: 'toclass', label: 'Back to class', from: hm(8, 28), to: hm(8, 40), speed: 0.25, jump: hm(8, 28), now: 'Lines break up from the back and go up to their classrooms' },
  { id: 'classes', label: 'Classes', from: hm(8, 40), to: hm(12, 30), speed: 8, jump: hm(8, 40), now: 'Lessons are on · a PE class runs laps of the track' },
  { id: 'lunch', label: 'Lunch break', from: hm(12, 30), to: hm(13, 10), speed: 0.5, jump: hm(12, 29), now: 'Students spill into the yard · basketball on the court' },
  { id: 'classes2', label: 'Classes', from: hm(13, 10), to: hm(15, 20), speed: 8, jump: hm(13, 10), now: 'Afternoon lessons · football on the pitch' },
  { id: 'home', label: 'Home time', from: hm(15, 20), to: hm(16, 5), speed: 0.35, jump: hm(15, 19), now: 'Classes empty out — buses, autos and the walk home' },
  { id: 'evening', label: 'Evening', from: hm(16, 5), to: hm(17, 50), speed: 1.0, jump: hm(16, 10), now: 'Teachers drive home · the gate shuts at 5:35' },
];
for (const p of PHASES) p.short = { arrival: 'Arrival', gather: 'Bell', assembly: 'Assembly', toclass: 'To class', classes: 'Classes', lunch: 'Lunch', classes2: 'Classes', home: 'Home', evening: 'Evening' }[p.id];

/** how long each part lasts on screen, in seconds */
export const screenSeconds = (p) => (p.to - p.from) / p.speed;

/** 0..1 through the day as the viewer sees it (busy parts take more of the strip) */
export function dayProgress(m) {
  const total = PHASES.reduce((s, p) => s + screenSeconds(p), 0);
  let acc = 0;
  for (const p of PHASES) {
    if (m < p.to) return Math.max(0, acc + Math.max(0, m - p.from) / p.speed) / total;
    acc += screenSeconds(p);
  }
  return 1;
}

export const DAY_START = hm(7, 15);
export const DAY_END = hm(17, 50);
export const phaseAt = (m) => PHASES.find((p) => m >= p.from && m < p.to) || PHASES[PHASES.length - 1];

export function clockLabel(m) {
  const h = Math.floor(m / 60);
  const mm = Math.floor(m % 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`;
}

export function phaseLabel(m) {
  const p = phaseAt(m);
  if (p.id === 'classes' || p.id === 'classes2') {
    const start = p.id === 'classes' ? hm(8, 40) : hm(13, 10);
    const n = Math.floor((m - start) / 45) + (p.id === 'classes' ? 1 : 6);
    return `Period ${Math.max(1, Math.min(8, n))}`;
  }
  return p.label;
}
