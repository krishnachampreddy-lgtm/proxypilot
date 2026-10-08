import { Router } from 'express';
import { z } from 'zod';
import { Proxies, Leaves, Users, Timetable, hydrateProxies } from '../db.js';
import { requireAuth, requireRole, validate } from '../middleware/auth.js';
import { arrangeCover } from '../services/cover.js';
import { advance } from '../services/matching.js';
import { hodSummary } from '../services/ai.js';
import { todayIST, monthStart, prettyDate, weekday, PERIOD_TIMES } from '../services/dates.js';
import { seedDatabase } from '../seedData.js';

const router = Router();
router.use(requireAuth, requireRole('hod'));

async function buildOverview() {
  const today = todayIST();
  const [upcomingRows, leaves, faculty, counts, pendingRows] = await Promise.all([
    Proxies.where('date >= $1 AND leave_id IS NOT NULL ORDER BY date, period', [today]),
    Leaves.upcoming(today),
    Users.faculty(),
    Proxies.monthCounts(monthStart(today), null),
    Leaves.pending(),
  ]);

  // leave requests waiting for the HOD, with the classes each one affects
  const leaveRequests = [];
  for (const l of pendingRows) {
    const day = weekday(l.date);
    const classes = (await Timetable.byFaculty(l.faculty_id))
      .filter((c) => c.day === day && l.periods.includes(c.period))
      .map((c) => ({ period: c.period, time: PERIOD_TIMES[c.period], className: c.class_name, subject: c.subject }));
    leaveRequests.push({
      _id: l.id,
      date: l.date,
      prettyDate: prettyDate(l.date),
      reason: l.reason,
      rawText: l.raw_text,
      facultyName: l.faculty_name,
      appliedAt: l.created_at,
      classes,
    });
  }
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
    leaveRequests: leaveRequests.length,
  };

  return {
    today,
    stats,
    leaveRequests,
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

// HOD approves or declines a leave request (a reason is required to decline)
const DecideBody = z
  .object({
    action: z.enum(['approve', 'decline']),
    note: z.string().trim().max(300, 'Keep the reason under 300 characters').optional().default(''),
  })
  .refine((b) => b.action === 'approve' || b.note.length >= 3, { message: 'Please write why you are declining this leave' });

router.post('/leaves/:id/decide', validate(DecideBody), async (req, res) => {
  const leave = await Leaves.byId(Number(req.params.id) || 0);
  if (!leave) return res.status(404).json({ error: 'Leave request not found' });
  if (leave.status !== 'pending') return res.status(409).json({ error: `This leave was already ${leave.status}.` });

  if (req.body.action === 'decline') {
    await Leaves.decide(leave.id, 'declined', req.body.note);
    return res.json({ ok: true, status: 'declined' });
  }
  const approved = await Leaves.decide(leave.id, 'approved', req.body.note || null);
  const proxies = await arrangeCover(approved);
  res.json({ ok: true, status: 'approved', proxies: proxies.length });
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
