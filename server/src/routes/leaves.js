import { Router } from 'express';
import { z } from 'zod';
import { Leaves, Proxies, Timetable, Users, hydrateProxies } from '../db.js';
import { ensureStarterTimetable } from '../services/starterTimetable.js';
import { requireAuth, requireRole, validate } from '../middleware/auth.js';
import { parseLeave } from '../services/ai.js';
import { leaveBalance, leaveCost } from '../services/leaveBalance.js';
import { todayIST, weekday, prettyDate, addDays, PERIOD_TIMES } from '../services/dates.js';

const router = Router();
router.use(requireAuth, requireRole('faculty'));

const LeaveBody = z
  .object({
    text: z.string().trim().max(500, 'Keep it under 500 characters').optional().default(''),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date').optional(),
    periods: z.array(z.number().int().min(1).max(6)).max(6).optional(),
    session: z.enum(['full', 'morning', 'afternoon', 'periods']).optional(),
  })
  .refine((b) => b.date || b.text.length >= 5, { message: 'Pick a date on the calendar or describe your leave' });

/**
 * Apply for leave: free text or a calendar date -> classes found -> sent to the HOD for approval.
 * After approval, services/cover.js ranks substitutes and sends the requests.
 */
router.post('/', validate(LeaveBody), async (req, res) => {
  const today = todayIST();
  await ensureStarterTimetable(await Users.byId(req.user.id));
  const myClasses = await Timetable.byFaculty(req.user.id);
  const scheduleText = myClasses.map((c) => `${c.day} P${c.period} ${c.class_name} ${c.subject}`).join('; ');

  // 1. Read the message; a date picked on the calendar always wins
  const { text, date, periods, session } = req.body;
  if (date && (date < today || date > addDays(today, 120))) {
    return res.status(400).json({ error: 'Pick a date between today and the next 4 months.' });
  }
  const parsed = text.length >= 3 ? await parseLeave(text, today, scheduleText) : { date: today, periods: [], reason: 'Leave', aiUsed: false };
  if (date) {
    parsed.date = date;
    parsed.periods = periods?.length ? periods : [];
  }
  const day = weekday(parsed.date);
  if (day === 'Sun') return res.status(400).json({ error: `${prettyDate(parsed.date)} is a Sunday — no classes.` });

  if (await Leaves.exists(req.user.id, parsed.date)) {
    return res.status(409).json({ error: `You already applied leave for ${prettyDate(parsed.date)}.` });
  }

  // 2. Match to the timetable: full day, a session, or chosen periods
  let affected = myClasses.filter((c) => c.day === day);
  let leaveType = session || (parsed.periods.length ? 'periods' : 'full');
  if (leaveType === 'morning') affected = affected.filter((c) => c.period <= 4);
  else if (leaveType === 'afternoon') affected = affected.filter((c) => c.period >= 5);
  else if (leaveType === 'periods' && parsed.periods.length) affected = affected.filter((c) => parsed.periods.includes(c.period));
  else leaveType = 'full';
  if (affected.length === 0) {
    return res.status(400).json({
      error: `You have no classes on ${prettyDate(parsed.date)}${parsed.periods.length ? ` in period ${parsed.periods.join(', ')}` : ''}. No proxy needed!`,
    });
  }

  // 3. Check the yearly leave balance
  const year = parsed.date.slice(0, 4);
  const balance = leaveBalance(await Leaves.byFaculty(req.user.id), year);
  if (balance.left < leaveCost(leaveType)) {
    return res.status(400).json({ error: `You have ${balance.left} of ${balance.total} leaves left for ${year}. Not enough for this request.` });
  }

  const leave = await Leaves.create({
    facultyId: req.user.id,
    date: parsed.date,
    rawText: text || `Leave on ${prettyDate(parsed.date)}`,
    reason: parsed.reason,
    periods: affected.map((c) => c.period),
    aiUsed: parsed.aiUsed,
    leaveType,
  });

  // 4. Goes to the HOD first; cover is arranged only after approval
  res.status(201).json({
    leave: { ...leave, _id: leave.id },
    status: 'pending',
    understood: {
      date: parsed.date,
      prettyDate: prettyDate(parsed.date),
      periods: leave.periods,
      reason: parsed.reason,
      leaveType,
    },
  });
});

// For the calendar: my weekly classes + dates I already took leave
router.get('/schedule', async (req, res) => {
  await ensureStarterTimetable(await Users.byId(req.user.id));
  const [classes, leaves] = await Promise.all([Timetable.byFaculty(req.user.id), Leaves.byFaculty(req.user.id)]);
  res.json({
    today: todayIST(),
    classes: classes.map((c) => ({ day: c.day, period: c.period, time: PERIOD_TIMES[c.period], className: c.class_name, subject: c.subject })),
    leaveDates: leaves.filter((l) => l.status !== 'declined').map((l) => l.date),
    balance: leaveBalance(leaves, todayIST().slice(0, 4)),
  });
});

// My leaves and how each class is being covered
router.get('/mine', async (req, res) => {
  await ensureStarterTimetable(await Users.byId(req.user.id));
  const leaves = await Leaves.byFaculty(req.user.id);
  const proxies = await hydrateProxies(await Proxies.where('absent_faculty_id = $1 ORDER BY period', [req.user.id]));
  res.json({
    leaves: leaves.map((l) => ({
      _id: l.id,
      date: l.date,
      prettyDate: prettyDate(l.date),
      rawText: l.raw_text,
      reason: l.reason,
      periods: l.periods,
      leaveType: l.leave_type,
      status: l.status,
      hodNote: l.hod_note,
      proxies: proxies.filter((p) => p.leave === l.id),
    })),
    balance: leaveBalance(leaves, todayIST().slice(0, 4)),
  });
});

// Withdraw a leave that the HOD has not decided yet
router.post('/:id/cancel', async (req, res) => {
  const leave = await Leaves.byId(Number(req.params.id) || 0);
  if (!leave || leave.faculty_id !== req.user.id) return res.status(404).json({ error: 'Leave not found' });
  if (leave.status !== 'pending') return res.status(409).json({ error: `This leave was already ${leave.status} and can't be cancelled.` });
  await Leaves.remove(leave.id);
  res.json({ ok: true });
});

export default router;
