import { Router } from 'express';
import { z } from 'zod';
import { Proxies, Leaves, Users, Timetable, hydrateProxies } from '../db.js';
import { requireAuth, requireRole, validate } from '../middleware/auth.js';
import { arrangeCover } from '../services/cover.js';
import { advance } from '../services/matching.js';
import { declineForNoCover } from '../services/cover.js';
import { hodSummary } from '../services/ai.js';
import { todayIST, monthStart, prettyDate, weekday, PERIOD_TIMES } from '../services/dates.js';
import { seedDatabase } from '../seedData.js';
import { leaveBalance } from '../services/leaveBalance.js';

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
      leaveType: l.leave_type,
      periods: l.periods,
      facultyName: l.faculty_name,
      appliedAt: l.created_at,
      balance: leaveBalance(await Leaves.byFaculty(l.faculty_id), String(l.date).slice(0, 4)),
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
  const after = await Leaves.byId(leave.id);
  if (after.status === 'declined') return res.json({ ok: true, status: 'declined', note: after.hod_note });
  res.json({ ok: true, status: 'approved', proxies: proxies.length });
});

// "No reply" button: pass the request to the next best teacher
router.post('/proxies/:id/skip', async (req, res) => {
  const proxy = await Proxies.byId(Number(req.params.id) || 0);
  if (!proxy || proxy.status !== 'pending') return res.status(409).json({ error: 'Request is not pending' });
  advance(proxy, 'no-reply');
  await Proxies.save(proxy);
  if (proxy.status === 'uncovered') {
    const note = await declineForNoCover(proxy.leave_id, proxy, 'declined');
    return res.json({ ok: true, leaveDeclined: true, note });
  }
  res.json({ ok: true });
});

// Monthly report as a CSV file that opens in Excel
const TYPE_LABEL = { full: 'Full day', morning: 'Morning session', afternoon: 'Afternoon session', periods: 'Selected periods' };
const STATUS_LABEL = { accepted: 'Covered', pending: 'Waiting for reply', uncovered: 'Not covered' };
const cell = (v) => {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

router.get('/report', async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : todayIST().slice(0, 7);
  const from = `${month}-01`;
  const to = `${month}-31`;
  const leaves = await Leaves.inMonth(from, to);
  const proxies = leaves.length
    ? await hydrateProxies(await Proxies.where('leave_id = ANY($1) ORDER BY period', [leaves.map((l) => l.id)]))
    : [];

  const rows = [['Date', 'Teacher', 'Leave type', 'Reason', 'HOD decision', 'HOD note', 'Period', 'Time', 'Class', 'Subject', 'Substitute', 'Cover status']];
  for (const l of leaves) {
    const base = [l.date, l.faculty_name, TYPE_LABEL[l.leave_type] || l.leave_type, l.reason, l.status, l.hod_note || ''];
    const mine = proxies.filter((p) => p.leave === l.id);
    if (mine.length === 0) rows.push([...base, '', '', '', '', '', '']);
    for (const p of mine) {
      rows.push([...base, `P${p.period}`, PERIOD_TIMES[p.period], p.className, p.subject, p.assignedTo?.name || '', STATUS_LABEL[p.status] || p.status]);
    }
  }
  rows.push([]);
  rows.push(['Summary']);
  rows.push(['Leave requests', leaves.length]);
  rows.push(['Approved', leaves.filter((l) => l.status === 'approved').length]);
  rows.push(['Declined', leaves.filter((l) => l.status === 'declined').length]);
  rows.push(['Pending', leaves.filter((l) => l.status === 'pending').length]);
  rows.push(['Classes covered', proxies.filter((p) => p.status === 'accepted').length]);

  const csv = '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="proxypilot-report-${month}.csv"`);
  res.send(csv);
});

// Wipe and reload demo data (handy right before presenting)
router.post('/reset-demo', async (req, res) => {
  await seedDatabase();
  res.json({ ok: true });
});

export default router;
