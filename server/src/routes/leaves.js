import { Router } from 'express';
import { z } from 'zod';
import { Leaves, Proxies, Timetable, hydrateProxies } from '../db.js';
import { requireAuth, requireRole, validate } from '../middleware/auth.js';
import { parseLeave, explainAndHandover, templateNote } from '../services/ai.js';
import { rankCandidates } from '../services/matching.js';
import { todayIST, weekday, prettyDate } from '../services/dates.js';

const router = Router();
router.use(requireAuth, requireRole('faculty'));

const LeaveBody = z.object({
  text: z.string().trim().min(5, 'Please describe your leave').max(500, 'Keep it under 500 characters'),
});

/**
 * The whole automation in one request:
 * free text -> AI reads it -> classes found -> substitutes ranked -> AI reason + handover -> requests sent
 */
router.post('/', validate(LeaveBody), async (req, res) => {
  const today = todayIST();
  const myClasses = await Timetable.byFaculty(req.user.id);
  const scheduleText = myClasses.map((c) => `${c.day} P${c.period} ${c.class_name} ${c.subject}`).join('; ');

  // 1. AI reads the message
  const parsed = await parseLeave(req.body.text, today, scheduleText);
  const day = weekday(parsed.date);
  if (day === 'Sun') return res.status(400).json({ error: `${prettyDate(parsed.date)} is a Sunday — no classes.` });

  if (await Leaves.exists(req.user.id, parsed.date)) {
    return res.status(409).json({ error: `You already applied leave for ${prettyDate(parsed.date)}.` });
  }

  // 2. Match to the timetable
  let affected = myClasses.filter((c) => c.day === day);
  if (parsed.periods.length) affected = affected.filter((c) => parsed.periods.includes(c.period));
  if (affected.length === 0) {
    return res.status(400).json({
      error: `You have no classes on ${prettyDate(parsed.date)}${parsed.periods.length ? ` in period ${parsed.periods.join(', ')}` : ''}. No proxy needed!`,
    });
  }

  const leave = await Leaves.create({
    facultyId: req.user.id,
    date: parsed.date,
    rawText: req.body.text,
    reason: parsed.reason,
    periods: affected.map((c) => c.period),
    aiUsed: parsed.aiUsed,
  });

  // 3. Rank substitutes for every class, one by one
  const proxies = [];
  const aiInput = [];
  for (const c of affected) {
    const ranked = await rankCandidates({
      date: parsed.date,
      day,
      period: c.period,
      className: c.class_name,
      subject: c.subject,
      absentFacultyId: req.user.id,
    });
    const top = ranked[0];
    const proxy = await Proxies.create({
      leaveId: leave.id,
      date: parsed.date,
      day,
      period: c.period,
      className: c.class_name,
      subject: c.subject,
      currentTopic: c.current_topic,
      absentFacultyId: req.user.id,
      candidates: ranked.map(({ faculty, score, factors }) => ({ faculty, score, factors })),
      offeredTo: top?.faculty,
      status: top ? 'pending' : 'uncovered',
      history: top ? [{ faculty: top.faculty, action: 'offered', at: new Date().toISOString() }] : [],
    });
    proxies.push(proxy);
    aiInput.push({
      id: String(proxy.id),
      className: c.class_name,
      subject: c.subject,
      period: c.period,
      topic: c.current_topic,
      absentName: req.user.name,
      top: top ? { name: top.name, factors: top.factors } : null,
    });
  }

  // 4. AI explains each pick and writes the handover note
  const notes = await explainAndHandover(aiInput);
  for (const [i, proxy] of proxies.entries()) {
    const note = notes[String(proxy.id)] || templateNote(aiInput[i]);
    proxy.ai_reason = note.reason;
    proxy.handover_note = note.handover;
    await Proxies.save(proxy);
  }

  res.status(201).json({
    leave: { ...leave, _id: leave.id },
    understood: {
      date: parsed.date,
      prettyDate: prettyDate(parsed.date),
      periods: leave.periods,
      reason: parsed.reason,
      aiUsed: parsed.aiUsed,
    },
    proxies: await hydrateProxies(await Proxies.where('leave_id = $1 ORDER BY period', [leave.id])),
  });
});

// My leaves and how each class is being covered
router.get('/mine', async (req, res) => {
  const leaves = await Leaves.byFaculty(req.user.id);
  const proxies = await hydrateProxies(await Proxies.where('absent_faculty_id = $1 ORDER BY period', [req.user.id]));
  res.json({
    leaves: leaves.map((l) => ({
      _id: l.id,
      date: l.date,
      prettyDate: prettyDate(l.date),
      rawText: l.raw_text,
      reason: l.reason,
      proxies: proxies.filter((p) => p.leave === l.id),
    })),
  });
});

export default router;
