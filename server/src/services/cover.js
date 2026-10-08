import { Proxies, Timetable, Users } from '../db.js';
import { rankCandidates } from './matching.js';
import { explainAndHandover, templateNote } from './ai.js';
import { weekday } from './dates.js';

/**
 * Runs after the HOD approves a leave:
 * for every class the teacher misses -> rank free substitutes -> reason + handover note -> request goes to the best fit.
 */
export async function arrangeCover(leave) {
  const day = weekday(leave.date);
  const absent = await Users.byId(leave.faculty_id);
  const classes = (await Timetable.byFaculty(leave.faculty_id)).filter((c) => c.day === day && leave.periods.includes(c.period));

  const proxies = [];
  const noteInput = [];
  for (const c of classes) {
    const ranked = await rankCandidates({
      date: leave.date,
      day,
      period: c.period,
      className: c.class_name,
      subject: c.subject,
      absentFacultyId: leave.faculty_id,
    });
    const top = ranked[0];
    const proxy = await Proxies.create({
      leaveId: leave.id,
      date: leave.date,
      day,
      period: c.period,
      className: c.class_name,
      subject: c.subject,
      currentTopic: c.current_topic,
      absentFacultyId: leave.faculty_id,
      candidates: ranked.map(({ faculty, score, factors }) => ({ faculty, score, factors })),
      offeredTo: top?.faculty,
      status: top ? 'pending' : 'uncovered',
      history: top ? [{ faculty: top.faculty, action: 'offered', at: new Date().toISOString() }] : [],
    });
    proxies.push(proxy);
    noteInput.push({
      id: String(proxy.id),
      className: c.class_name,
      subject: c.subject,
      period: c.period,
      topic: c.current_topic,
      absentName: absent?.name,
      top: top ? { name: top.name, factors: top.factors } : null,
    });
  }

  const notes = await explainAndHandover(noteInput);
  for (const [i, proxy] of proxies.entries()) {
    const note = notes[String(proxy.id)] || templateNote(noteInput[i]);
    proxy.ai_reason = note.reason;
    proxy.handover_note = note.handover;
    await Proxies.save(proxy);
  }
  return proxies;
}
