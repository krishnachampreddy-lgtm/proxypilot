import { useCallback, useEffect, useState } from 'react';
import api, { errorText } from '../api';
import { Button, Card, Empty, ErrorBox, StatusBadge } from '../components/ui.jsx';
import LeaveCalendar, { dayKey } from '../components/LeaveCalendar.jsx';

const EXAMPLES = [
  'Down with fever, cannot come tomorrow. Please arrange proxies for my classes.',
  'Have a family function tomorrow, can’t take my 2nd and 4th period.',
  'Attending a workshop today, please cover my classes after lunch (period 5-6).',
];

function Candidates({ list }) {
  if (!list?.length) return null;
  return (
    <details className="mt-2 text-xs text-ink/80">
      <summary className="cursor-pointer text-brass-2">See ranking ({list.length} free teachers)</summary>
      <ol className="mt-2 space-y-1">
        {list.slice(0, 5).map((c, i) => (
          <li key={i} className="flex justify-between gap-2 rounded bg-paper px-2 py-1">
            <span><b>{i + 1}. {c.faculty?.name}</b> — {c.factors.join(', ')}</span>
            <span className="font-mono text-muted">{c.score}</span>
          </li>
        ))}
      </ol>
    </details>
  );
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
        body.periods = dayClasses.map((c) => c.period).filter((p) => !skip.includes(p));
        if (!body.periods.length) throw { response: { data: { error: 'Select at least one class to cover.' } } };
      }
      const { data } = await api.post('/leaves', body);
      setResult(data);
      setText('');
      setDate(null);
      setSkip([]);
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const dayClasses = date && schedule ? schedule.classes.filter((c) => c.day === dayKey(date)).sort((a, b) => a.period - b.period) : [];
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
                    <p className="mt-1 text-xs text-muted">Classes to cover (tap to leave one out):</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dayClasses.map((c) => {
                        const on = !skip.includes(c.period);
                        return (
                          <button
                            type="button"
                            key={c.period}
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
            <Button type="submit" disabled={busy || (date ? dayClasses.length === 0 : text.trim().length < 5)}>
              {busy ? 'Arranging cover…' : date ? 'Apply leave for this date' : 'Submit leave'}
            </Button>
          </form>

          {result && (
            <div className="mt-5 space-y-3 rounded-md border border-brass bg-brass-soft/60 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink/80">
                  Understood: <b>{result.understood.prettyDate}</b> · periods <b>{result.understood.periods.join(', ')}</b> · {result.understood.reason}
                </span>
              </div>
              {result.proxies.map((p) => (
                <div key={p._id} className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">
                      Period {p.period} · {p.className} · {p.subject}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-1 text-sm text-ink/80">
                    {p.offeredTo ? <>Request sent to <b>{p.offeredTo.name}</b></> : 'No free teacher found'}
                  </p>
                  {p.aiReason && <p className="mt-1 text-xs text-brass-2">{p.aiReason}</p>}
                  <Candidates list={p.candidates} />
                </div>
              ))}
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
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">{l.prettyDate}</span>
                    <span className="text-xs text-muted">{l.reason}</span>
                  </div>
                  <p className="mt-1 text-xs italic text-muted">“{l.rawText}”</p>
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
        <Card title="Proxy requests for you" subtitle="Updates every few seconds" right={requests.waiting.length ? <span className="rounded-full bg-brass-soft0 px-2 py-0.5 text-xs font-bold text-white">{requests.waiting.length}</span> : null}>
          {requests.waiting.length === 0 ? (
            <Empty>No requests right now.</Empty>
          ) : (
            <div className="space-y-3">
              {requests.waiting.map((p) => (
                <div key={p._id} className="rounded-md border border-brass/40 bg-brass-soft p-3">
                  <div className="text-sm font-semibold text-ink">
                    {p.prettyDate} · Period {p.period} ({p.time})
                  </div>
                  <div className="text-sm text-ink/80">
                    {p.className} · {p.subject} — for {p.absentFaculty?.name}
                  </div>
                  {p.aiReason && <p className="mt-1 text-xs text-brass-2">Why you: {p.aiReason}</p>}
                  {p.handoverNote && (
                    <div className="mt-2 whitespace-pre-line rounded-lg bg-white p-2 text-xs text-ink/80">
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
          )}
        </Card>

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
  );
}
