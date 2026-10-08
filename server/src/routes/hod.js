import { Router } from 'express';
import { Proxies, Leaves, Users, hydrateProxies } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { advance } from '../services/matching.js';
import { hodSummary } from '../services/ai.js';
import { todayIST, monthStart, prettyDate, PERIOD_TIMES } from '../services/dates.js';
import { seedDatabase } from '../seedData.js';

const router = Router();
router.use(requireAuth, requireRole('hod'));

async function buildOverview() {
  const today = todayIST();
  const [upcomingRows, leaves, faculty, counts] = await Promise.all([
    Proxies.where('date >= $1 AND leave_id IS NOT NULL ORDER BY date, period', [today]),
    Leaves.upcoming(today),
    Users.faculty(),
    Proxies.monthCounts(monthStart(today), null),
  ]);
  const upcoming = await hydrateProxies(upcomingRows);

  const loadThisMonth = faculty
    .map((f) => ({ name: f.name, count: counts[f.id] || 0 }))
    .sort((a, b) => b.count - a.count);

  const stats = {
    total: upcoming.length,
    covered: upcoming.filter((p) => p.status === 'accepted').length,
    pending: upcoming.filter((p) => p.status === 'pending').length,
    uncovered: upcoming.filter((p) => p.status === 'uncovered').length,
    teachersOnLeave: leaves.length,
  };

  return {
    today,
    stats,
    loadThisMonth,
    leaves: leaves.map((l) => ({ _id: l.id, date: l.date, prettyDate: prettyDate(l.date), reason: l.reason, faculty: { name: l.faculty_name } })),
    proxies: upcoming.map((p) => ({ ...p, prettyDate: prettyDate(p.date), time: PERIOD_TIMES[p.period] })),
  };
}

router.get('/overview', async (req, res) => {
  res.json(await buildOverview());
});

// Short AI-written summary for the HOD
router.get('/summary', async (req, res) => {
  const o = await buildOverview();
  const summary = await hodSummary({ ...o.stats, loadThisMonth: o.loadThisMonth.slice(0, 4) });
  res.json({ summary });
});

// "No reply" button: pass the request to the next best teacher
router.post('/proxies/:id/skip', async (req, res) => {
  const proxy = await Proxies.byId(Number(req.params.id) || 0);
  if (!proxy || proxy.status !== 'pending') return res.status(409).json({ error: 'Request is not pending' });
  advance(proxy, 'no-reply');
  await Proxies.save(proxy);
  res.json({ ok: true });
});

// Wipe and reload demo data (handy right before presenting)
router.post('/reset-demo', async (req, res) => {
  await seedDatabase();
  res.json({ ok: true });
});

export default router;
