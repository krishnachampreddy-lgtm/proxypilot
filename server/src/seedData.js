import bcrypt from 'bcryptjs';
import { q } from './db.js';
import { todayIST, monthStart } from './services/dates.js';

// Fake but realistic demo data. Every account's password is: demo123
export const DEMO_PASSWORD = 'demo123';

const FACULTY = [
  { name: 'Dr. Anita Mehta', email: 'mehta@college.edu', subjects: ['DBMS', 'Software Engg'] },
  { name: 'Prof. Ravi Rao', email: 'rao@college.edu', subjects: ['DBMS', 'Web Tech', 'Web Lab'] },
  { name: 'Dr. Sunil Iyer', email: 'iyer@college.edu', subjects: ['Operating Systems', 'Computer Networks'] },
  { name: 'Prof. Kavya Nair', email: 'nair@college.edu', subjects: ['DSA', 'AI', 'DSA Lab'] },
  { name: 'Dr. Arjun Singh', email: 'singh@college.edu', subjects: ['Maths-III', 'Compiler Design'] },
  { name: 'Prof. Meera Joshi', email: 'joshi@college.edu', subjects: ['COA', 'Computer Networks'] },
  { name: 'Prof. Farhan Ali', email: 'ali@college.edu', subjects: ['DSA', 'Web Tech', 'DSA Lab', 'Web Lab'] },
  { name: 'Dr. Priya Das', email: 'das@college.edu', subjects: ['Operating Systems', 'AI'] },
];

const CLASSES = [
  { name: 'CSE-2A', subjects: ['DBMS', 'Operating Systems', 'DSA', 'Maths-III', 'COA', 'DSA Lab'] },
  { name: 'CSE-2B', subjects: ['DBMS', 'Operating Systems', 'DSA', 'Maths-III', 'COA', 'DSA Lab'] },
  { name: 'CSE-3A', subjects: ['Computer Networks', 'AI', 'Software Engg', 'Compiler Design', 'Web Tech', 'Web Lab'] },
  { name: 'CSE-3B', subjects: ['Computer Networks', 'AI', 'Software Engg', 'Compiler Design', 'Web Tech', 'Web Lab'] },
];

const TOPICS = {
  DBMS: 'Normalization — 2NF and 3NF',
  'Operating Systems': 'CPU scheduling — Round Robin',
  DSA: 'Binary search trees — deletion',
  'Maths-III': 'Laplace transforms — inverse',
  COA: 'Pipelining and hazards',
  'DSA Lab': 'Lab 6 — BST implementation',
  'Computer Networks': 'TCP congestion control',
  AI: 'A* search and heuristics',
  'Software Engg': 'UML use-case diagrams',
  'Compiler Design': 'LL(1) parsing tables',
  'Web Tech': 'React components and props',
  'Web Lab': 'Lab 5 — REST API with Express',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_PER_DAY = 4;

export async function seedDatabase() {
  // Clear demo data only — real accounts (Google / Gmail / sign-up) are kept
  await q('DELETE FROM proxies');
  await q('DELETE FROM leaves');
  await q('DELETE FROM timetable');
  await q(`DELETE FROM users WHERE email LIKE '%@college.edu'`);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const insertUser = async (u) =>
    (
      await q(
        `INSERT INTO users (name, email, password_hash, role, subjects, class_name)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, subjects`,
        [u.name, u.email, passwordHash, u.role, u.subjects || [], u.className || null]
      )
    )[0];

  const faculty = [];
  for (const f of FACULTY) faculty.push(await insertUser({ ...f, role: 'faculty' }));
  await insertUser({ name: 'Dr. Rajesh Kumar (HOD)', email: 'hod@college.edu', role: 'hod' });
  await insertUser({ name: 'Aarav Sharma', email: 'aarav@college.edu', role: 'student', className: 'CSE-2A' });

  // Build a clash-free weekly timetable
  const slots = [];
  const weekly = new Map(faculty.map((f) => [f.id, 0]));
  DAYS.forEach((day, d) => {
    const daily = new Map(faculty.map((f) => [f.id, 0]));
    for (let period = 1; period <= 6; period++) {
      const busy = new Set();
      CLASSES.forEach((cls, c) => {
        const start = (period - 1 + d * 2 + c) % 6;
        const order = [...cls.subjects.slice(start), ...cls.subjects.slice(0, start)];
        for (const subject of order) {
          const options = faculty
            .filter((f) => f.subjects.includes(subject) && !busy.has(f.id) && daily.get(f.id) < MAX_PER_DAY)
            .sort((a, b) => daily.get(a.id) - daily.get(b.id) || weekly.get(a.id) - weekly.get(b.id));
          const f = options[0];
          if (!f) continue;
          busy.add(f.id);
          daily.set(f.id, daily.get(f.id) + 1);
          weekly.set(f.id, weekly.get(f.id) + 1);
          slots.push([day, period, cls.name, subject, TOPICS[subject], f.id]);
          break;
        }
      });
    }
  });
  const params = slots.flat();
  const values = slots.map((_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`).join(',');
  await q(`INSERT INTO timetable (day, period, class_name, subject, current_topic, faculty_id) VALUES ${values}`, params);

  // Earlier proxies this month, so the fairness chart has a story:
  // Dr. Iyer has been overloaded.
  const past = monthStart(todayIST());
  const history = { 'iyer@college.edu': 4, 'joshi@college.edu': 2, 'nair@college.edu': 1, 'rao@college.edu': 1 };
  let pastCount = 0;
  for (const [email, n] of Object.entries(history)) {
    const f = faculty.find((x) => x.email === email);
    for (let i = 0; i < n; i++) {
      await q(`INSERT INTO proxies (date, status, assigned_to, offered_to) VALUES ($1, 'accepted', $2, $2)`, [past, f.id]);
      pastCount++;
    }
  }

  console.log(`Seeded ${faculty.length} faculty, ${slots.length} timetable slots, ${pastCount} past proxies`);
}

/** Load demo data the first time the app runs on an empty database. */
let seeding;
export function seedIfEmpty() {
  seeding ||= (async () => {
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM users WHERE email LIKE '%@college.edu'`);
    if (n === 0) await seedDatabase();
  })().catch((e) => {
    seeding = null;
    throw e;
  });
  return seeding;
}
