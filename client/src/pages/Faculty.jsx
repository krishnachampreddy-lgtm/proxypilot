import { useCallback, useEffect, useState } from 'react';
import api, { errorText } from '../api';
import { Button, Card, Empty, ErrorBox, StatusBadge } from '../components/ui.jsx';
import LeaveCalendar, { dayKey } from '../components/LeaveCalendar.jsx';
import { leaveTypeLabel } from '../leaveType.js';

const EXAMPLES = [
  'Down with fever, cannot come tomorrow. Please arrange proxies for my classes.',
  'Have a family function tomorrow, can’t take my 2nd and 4th period.',
  'Attending a workshop today, please cover my classes after lunch (period 5-6).',
];

const LEAVE_STATUS = {
  pending: ['Awaiting HOD', 'bg-brass-soft text-brass-2'],
  approved: ['Approved', 'bg-sage-soft text-sage'],
  declined: ['Declined', 'bg-clay-soft text-clay'],
};
function LeaveStatus({ status }) {
  const [label, cls] = LEAVE_STATUS[status] || LEAVE_STATUS.approved;
  return <span className={`rounded px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${cls}`}>{label}</span>;
}

export default function Faculty() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [requests, setRequests] = useState({ waiting: [], accepted: [] });
  const [schedule, setSchedule] = useState(null);
  const [date, setDate] = useState(null);
  const [skip, setSkip] = useState([]); // periods the teacher un-ticked
  const [session, setSession] = useState('full'); // full | morning | afternoon | periods

  const load = useCallback(async () => {
    try {
      const [l, r, s] = await Promise.all([api.get('/leaves/mine'), api.get('/proxies/mine'), api.get('/leaves/schedule')]);
      setLeaves(l.data.leaves);
      setRequests(r.data);
      setSchedule(s.data);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // live updates during the demo
    return () => clearInterval(t);
  }, [load]);

  const submitLeave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const body = { text };
      if (date) {
        body.date = date;
        body.session = session;
        const chosen = sessionClasses.map((c) => c.period).filter((p) => session !== 'periods' || !skip.includes(p));
        if (!chosen.length) throw { response: { data: { error: 'Select at least one class to cover.' } } };
        if (session === 'periods') body.periods = chosen;
      }
      const { data } = await api.post('/leaves', body);
      setResult(data);
      setText('');
      setDate(null);
      setSkip([]);
      setSession('full');
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const dayClasses = date && schedule ? schedule.classes.filter((c) => c.day === dayKey(date)).sort((a, b) => a.period - b.period) : [];
  const sessionClasses = dayClasses.filter((c) => (session === 'morning' ? c.period <= 4 : session === 'afternoon' ? c.period >= 5 : true));
  const pretty = date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '';

  const respond = async (id, action) => {
    try {
      await api.post(`/proxies/${id}/respond`, { action });
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="space-y-6">
      {requests.waiting.length > 0 && (
        <section className="rounded-lg border-2 border-brass bg-white/95 p-5 shadow-[0_12px_32px_-18px_rgba(168,122,42,0.6)]">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brass font-mono text-sm font-semibold text-ink">{requests.waiting.length}</span>
            <div>
              <h2 className="font-display text-xl font-medium text-ink">
                {requests.waiting.length === 1 ? 'A colleague needs your help' : 'Colleagues need your help'}
              </h2>
              <p className="text-sm text-muted">Accept to take the class, or decline and it passes to the next teacher.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {requests.waiting.map((p) => (
              <div key={p._id} className="rounded-md border border-line bg-paper/70 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-lg font-medium text-ink">{p.className} · {p.subject}</div>
                    <div className="font-mono text-xs text-muted">{p.prettyDate} · P{p.period} · {p.time}</div>
                  </div>
                  <span className="rounded bg-brass-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-brass-2">Waiting</span>
                </div>
                <p className="mt-2 text-sm text-ink/80">Covering for <b>{p.absentFaculty?.name}</b></p>
                {p.aiReason && <p className="mt-1 text-xs text-brass-2">Why you: {p.aiReason}</p>}
                {p.handoverNote && (
                  <div className="mt-2 whitespace-pre-line rounded border border-line bg-white p-2 text-xs text-ink/80">
                    <b>Handover note</b>
                    {'\n'}
                    {p.handoverNote}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <Button variant="success" onClick={() => respond(p._id, 'accept')}>Accept</Button>
                  <Button variant="ghost" onClick={() => respond(p._id, 'decline')}>Decline</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <Card title="Apply for leave" subtitle="Pick a date on the calendar, or just write it like a WhatsApp message.">
          <form onSubmit={submitLeave} className="space-y-4">
            {schedule && (
              <LeaveCalendar
                today={schedule.today}
                classes={schedule.classes}
                leaveDates={schedule.leaveDates}
                value={date}
                onChange={(d) => { setDate(d); setSkip([]); setError(''); }}
              />
            )}

            {date && (
              <div className="rounded-md border border-line bg-paper/60 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">{pretty}</p>
                  <button type="button" onClick={() => setDate(null)} className="text-xs text-brass-2 hover:underline">Clear date</button>
                </div>
                {dayClasses.length === 0 ? (
                  <p className="mt-1 text-sm text-muted">You have no classes this day, so nothing needs covering.</p>
                ) : (
                  <>
                    <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-muted">Leave for</p>
                    <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        ['full', 'Full day', 'All classes'],
                        ['morning', 'Morning', 'P1 – P4'],
                        ['afternoon', 'Afternoon', 'P5 – P6'],
                        ['periods', 'Choose periods', 'Pick below'],
                      ].map(([key, label, hint]) => (
                        <button
                          type="button"
                          key={key}
                          onClick={() => { setSession(key); setSkip([]); }}
                          className={`rounded-md border px-3 py-2 text-left transition ${session === key ? 'border-brass bg-brass-soft text-ink' : 'border-line bg-white text-ink/80 hover:border-ink/40'}`}
                        >
                          <span className="block text-sm font-semibold">{label}</span>
                          <span className="block font-mono text-[10px] uppercase tracking-wide text-muted">{hint}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      {sessionClasses.length === 0
                        ? 'You have no classes in this session, so nothing needs covering.'
                        : session === 'periods'
                          ? 'Classes to cover (tap to leave one out):'
                          : 'These classes will need cover:'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sessionClasses.map((c) => {
                        const on = session !== 'periods' || !skip.includes(c.period);
                        return (
                          <button
                            type="button"
                            key={c.period}
                            disabled={session !== 'periods'}
                            onClick={() => setSkip((s) => (on ? [...s, c.period] : s.filter((p) => p !== c.period)))}
                            className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition ${on ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-muted line-through'}`}
                          >
                            <span className="font-mono">P{c.period} · {c.time}</span>
                            <span className="block font-medium">{c.className} · {c.subject}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            <div>
              <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-muted">
                {date ? 'Reason (optional)' : 'Or describe your leave'}
              </label>
              <textarea
                rows={date ? 2 : 3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={date ? 'e.g. Family function' : "e.g. Down with fever, can't come tomorrow…"}
                className="w-full rounded-md border border-line p-3 text-sm outline-none focus:border-ink"
              />
              {!date && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {EXAMPLES.map((ex) => (
                    <button type="button" key={ex} onClick={() => setText(ex)} className="rounded-full bg-paper px-3 py-1 text-xs text-ink/80 hover:bg-paper-2">
                      {ex.length > 45 ? ex.slice(0, 45) + '…' : ex}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ErrorBox text={error} />
            <Button type="submit" disabled={busy || (date ? sessionClasses.length === 0 : text.trim().length < 5)}>
              {busy ? 'Arranging cover…' : date ? 'Apply leave for this date' : 'Submit leave'}
            </Button>
          </form>

          {result && (
            <div className="mt-5 rounded-md border border-brass bg-brass-soft/60 p-4">
              <p className="font-display text-lg font-medium text-ink">Sent to the HOD for approval</p>
              <p className="mt-1 text-sm text-ink/80">
                <b>{result.understood.prettyDate}</b> · {leaveTypeLabel(result.understood.leaveType, result.understood.periods)} · {result.understood.reason}
              </p>
              <p className="mt-2 text-xs text-muted">Once the HOD approves, substitutes are arranged for your classes. You can follow it under “My leaves”.</p>
            </div>
          )}
        </Card>

        <Card title="My leaves" subtitle="Live status of every class you are missing">
          {leaves.length === 0 ? (
            <Empty>No leaves yet.</Empty>
          ) : (
            <div className="space-y-4">
              {leaves.map((l) => (
                <div key={l._id} className="rounded-md border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{l.prettyDate}</span>
                    <LeaveStatus status={l.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink/80">{leaveTypeLabel(l.leaveType, l.periods)}</p>
                  <p className="mt-0.5 text-xs italic text-muted">“{l.rawText}” · {l.reason}</p>
                  {l.status === 'pending' && <p className="mt-2 text-sm text-ink/80">Waiting for the HOD to approve.</p>}
                  {l.status === 'declined' && (
                    <div className="mt-2 rounded border border-clay/30 bg-clay-soft px-3 py-2 text-sm text-clay">
                      <b>{l.hodNote?.startsWith('Declined automatically') ? 'Reason:' : 'HOD’s reason:'}</b> {l.hodNote?.replace('Declined automatically: ', '')}
                    </div>
                  )}
                  <ul className="mt-2 divide-y divide-line/70">
                    {l.proxies.map((p) => (
                      <li key={p._id} className="flex items-center justify-between py-1.5 text-sm">
                        <span>P{p.period} · {p.className} · {p.subject}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-ink/80">{p.assignedTo?.name || p.offeredTo?.name || '—'}</span>
                          <StatusBadge status={p.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-6 lg:col-span-2">
        {requests.waiting.length === 0 && (
          <Card title="Proxy requests for you" subtitle="When a colleague is on leave and you are the best fit, the request shows up here.">
            <Empty>No requests right now.</Empty>
          </Card>
        )}

        <Card title="My upcoming proxies">
          {requests.accepted.length === 0 ? (
            <Empty>None.</Empty>
          ) : (
            <ul className="space-y-2">
              {requests.accepted.map((p) => (
                <li key={p._id} className="rounded-lg bg-sage-soft px-3 py-2 text-sm text-sage">
                  <b>{p.prettyDate}</b> · P{p.period} ({p.time}) · {p.className} {p.subject}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
    </div>
  );
}
