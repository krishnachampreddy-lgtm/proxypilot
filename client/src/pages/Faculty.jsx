import { useCallback, useEffect, useState } from 'react';
import api, { errorText } from '../api';
import { AiBadge, Button, Card, Empty, ErrorBox, StatusBadge } from '../components/ui.jsx';

const EXAMPLES = [
  'Down with fever, cannot come tomorrow. Please arrange proxies for my classes.',
  'Have a family function tomorrow, can’t take my 2nd and 4th period.',
  'Attending a workshop today, please cover my classes after lunch (period 5-6).',
];

function Candidates({ list }) {
  if (!list?.length) return null;
  return (
    <details className="mt-2 text-xs text-slate-600">
      <summary className="cursor-pointer text-indigo-600">See ranking ({list.length} free teachers)</summary>
      <ol className="mt-2 space-y-1">
        {list.slice(0, 5).map((c, i) => (
          <li key={i} className="flex justify-between gap-2 rounded bg-slate-50 px-2 py-1">
            <span><b>{i + 1}. {c.faculty?.name}</b> — {c.factors.join(', ')}</span>
            <span className="font-mono text-slate-500">{c.score}</span>
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

  const load = useCallback(async () => {
    try {
      const [l, r] = await Promise.all([api.get('/leaves/mine'), api.get('/proxies/mine')]);
      setLeaves(l.data.leaves);
      setRequests(r.data);
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
      const { data } = await api.post('/leaves', { text });
      setResult(data);
      setText('');
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

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
        <Card title="Apply for leave" subtitle="Type it like a WhatsApp message — ProxyPilot does the rest.">
          <form onSubmit={submitLeave} className="space-y-3">
            <textarea
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Down with fever, can't come tomorrow…"
              className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-indigo-500"
            />
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <button type="button" key={ex} onClick={() => setText(ex)} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200">
                  {ex.length > 45 ? ex.slice(0, 45) + '…' : ex}
                </button>
              ))}
            </div>
            <ErrorBox text={error} />
            <Button type="submit" disabled={busy || text.trim().length < 5}>
              {busy ? 'AI is arranging proxies…' : 'Submit leave'}
            </Button>
          </form>

          {result && (
            <div className="mt-5 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <AiBadge used={result.understood.aiUsed} />
                <span className="text-slate-700">
                  Understood: <b>{result.understood.prettyDate}</b> · periods <b>{result.understood.periods.join(', ')}</b> · {result.understood.reason}
                </span>
              </div>
              {result.proxies.map((p) => (
                <div key={p._id} className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">
                      Period {p.period} · {p.className} · {p.subject}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    {p.offeredTo ? <>Request sent to <b>{p.offeredTo.name}</b></> : 'No free teacher found'}
                  </p>
                  {p.aiReason && <p className="mt-1 text-xs text-indigo-700">✦ {p.aiReason}</p>}
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
                <div key={l._id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{l.prettyDate}</span>
                    <span className="text-xs text-slate-500">{l.reason}</span>
                  </div>
                  <p className="mt-1 text-xs italic text-slate-500">“{l.rawText}”</p>
                  <ul className="mt-2 divide-y divide-slate-100">
                    {l.proxies.map((p) => (
                      <li key={p._id} className="flex items-center justify-between py-1.5 text-sm">
                        <span>P{p.period} · {p.className} · {p.subject}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-slate-600">{p.assignedTo?.name || p.offeredTo?.name || '—'}</span>
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
        <Card title="Proxy requests for you" subtitle="Updates every few seconds" right={requests.waiting.length ? <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{requests.waiting.length}</span> : null}>
          {requests.waiting.length === 0 ? (
            <Empty>No requests right now.</Empty>
          ) : (
            <div className="space-y-3">
              {requests.waiting.map((p) => (
                <div key={p._id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <div className="text-sm font-semibold text-slate-800">
                    {p.prettyDate} · Period {p.period} ({p.time})
                  </div>
                  <div className="text-sm text-slate-700">
                    {p.className} · {p.subject} — for {p.absentFaculty?.name}
                  </div>
                  {p.aiReason && <p className="mt-1 text-xs text-indigo-700">✦ Why you: {p.aiReason}</p>}
                  {p.handoverNote && (
                    <div className="mt-2 whitespace-pre-line rounded-lg bg-white p-2 text-xs text-slate-700">
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
                <li key={p._id} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
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
