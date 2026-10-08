import { useCallback, useEffect, useState } from 'react';
import api, { errorText } from '../api';
import { AiBadge, Button, Card, Empty, ErrorBox, StatusBadge } from '../components/ui.jsx';

function Stat({ label, value, tone }) {
  const tones = {
    slate: 'text-slate-900',
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-rose-600',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`text-3xl font-bold ${tones[tone]}`}>{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

function LoadChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const avg = data.reduce((s, d) => s + d.count, 0) / (data.length || 1);
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const heavy = d.count > avg * 1.5 && d.count >= 3;
        return (
          <div key={d.name} className="grid grid-cols-[9.5rem_1fr_2rem] items-center gap-2 text-sm">
            <span className="truncate text-slate-700">{d.name}</span>
            <div className="h-5 rounded bg-slate-100">
              <div className={`h-5 rounded ${heavy ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${(d.count / max) * 100}%` }} />
            </div>
            <span className={`text-right font-semibold ${heavy ? 'text-rose-600' : 'text-slate-700'}`}>{d.count}</span>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-slate-500">Red = overloaded (well above the department average of {avg.toFixed(1)}).</p>
    </div>
  );
}

export default function Hod() {
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');
  const [summaryBusy, setSummaryBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/hod/overview');
      setData(data);
    } catch (err) {
      setError(errorText(err));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const getSummary = async () => {
    setSummaryBusy(true);
    try {
      const { data } = await api.get('/hod/summary');
      setSummary(data.summary);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSummaryBusy(false);
    }
  };

  const skip = async (id) => {
    await api.post(`/hod/proxies/${id}/skip`).catch((err) => setError(errorText(err)));
    load();
  };

  const reset = async () => {
    if (!window.confirm('Reset all demo data?')) return;
    await api.post('/hod/reset-demo');
    localStorage.clear();
    window.location.href = '/';
  };

  if (!data) return <p className="text-slate-500">{error || 'Loading…'}</p>;
  const { stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Department overview</h1>
          <p className="text-sm text-slate-500">CSE · today and upcoming · updates every few seconds</p>
        </div>
        <Button variant="ghost" onClick={reset}>Reset demo data</Button>
      </div>
      <ErrorBox text={error} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Teachers on leave" value={stats.teachersOnLeave} tone="slate" />
        <Stat label="Classes to cover" value={stats.total} tone="slate" />
        <Stat label="Covered" value={stats.covered} tone="green" />
        <Stat label="Waiting for reply" value={stats.pending} tone="amber" />
        <Stat label="Not covered" value={stats.uncovered} tone="red" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Proxy lectures" subtitle="Every class that needs a substitute">
          {data.proxies.length === 0 ? (
            <Empty>No leaves today or upcoming. Log in as a faculty member and apply for leave.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">When</th>
                    <th className="py-2 pr-2">Class</th>
                    <th className="py-2 pr-2">Absent</th>
                    <th className="py-2 pr-2">Substitute</th>
                    <th className="py-2 pr-2">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.proxies.map((p) => (
                    <tr key={p._id} className="align-top">
                      <td className="py-2 pr-2">
                        <div className="font-medium text-slate-800">{p.prettyDate}</div>
                        <div className="text-xs text-slate-500">P{p.period} · {p.time}</div>
                      </td>
                      <td className="py-2 pr-2">{p.className}<div className="text-xs text-slate-500">{p.subject}</div></td>
                      <td className="py-2 pr-2">{p.absentFaculty?.name}</td>
                      <td className="py-2 pr-2">
                        {p.assignedTo?.name || p.offeredTo?.name || '—'}
                        {p.history.length > 1 && (
                          <div className="text-xs text-slate-500">{p.history.filter((h) => h.action === 'declined' || h.action === 'no-reply').length} passed on</div>
                        )}
                      </td>
                      <td className="py-2 pr-2"><StatusBadge status={p.status} /></td>
                      <td className="py-2 text-right">
                        {p.status === 'pending' && (
                          <button onClick={() => skip(p._id)} className="whitespace-nowrap text-xs font-semibold text-indigo-600 hover:underline">
                            No reply → next
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card title="AI insight" right={<AiBadge />}>
            {summary ? <p className="text-sm text-slate-700">{summary}</p> : <p className="text-sm text-slate-500">Get a quick summary of coverage and fairness.</p>}
            <Button className="mt-3" variant="ghost" disabled={summaryBusy} onClick={getSummary}>
              {summaryBusy ? 'Thinking…' : summary ? 'Refresh insight' : 'Generate insight'}
            </Button>
          </Card>
          <Card title="Proxy load this month" subtitle="Used to keep the ranking fair">
            <LoadChart data={data.loadThisMonth} />
          </Card>
        </div>
      </div>
    </div>
  );
}
