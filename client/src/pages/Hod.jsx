import { useCallback, useEffect, useState } from 'react';
import api, { errorText } from '../api';
import { Button, Card, Empty, ErrorBox, StatusBadge } from '../components/ui.jsx';

function Stat({ label, value, tone }) {
  const tones = {
    slate: 'text-ink',
    green: 'text-sage',
    amber: 'text-brass-2',
    red: 'text-clay',
  };
  return (
    <div className="rounded-lg border border-line bg-white/90 p-4 backdrop-blur-sm">
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 font-display text-4xl font-medium tabular-nums ${tones[tone]}`}>{value}</div>
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
            <span className="truncate text-ink/80">{d.name}</span>
            <div className="h-5 rounded bg-paper">
              <div className={`h-5 rounded ${heavy ? 'bg-clay' : 'bg-ink-3'}`} style={{ width: `${(d.count / max) * 100}%` }} />
            </div>
            <span className={`text-right font-semibold ${heavy ? 'text-clay' : 'text-ink/80'}`}>{d.count}</span>
          </div>
        );
      })}
      <p className="pt-1 text-xs text-muted">Red = overloaded (well above the department average of {avg.toFixed(1)}).</p>
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

  if (!data) return <p className="text-muted">{error || 'Loading…'}</p>;
  const { stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight text-ink">Department overview</h1>
          <p className="text-sm text-muted">CSE · today and upcoming · updates every few seconds</p>
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
                  <tr className="border-b border-line text-left text-xs uppercase text-muted">
                    <th className="py-2 pr-2">When</th>
                    <th className="py-2 pr-2">Class</th>
                    <th className="py-2 pr-2">Absent</th>
                    <th className="py-2 pr-2">Substitute</th>
                    <th className="py-2 pr-2">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {data.proxies.map((p) => (
                    <tr key={p._id} className="align-top">
                      <td className="py-2 pr-2">
                        <div className="font-medium text-ink">{p.prettyDate}</div>
                        <div className="text-xs text-muted">P{p.period} · {p.time}</div>
                      </td>
                      <td className="py-2 pr-2">{p.className}<div className="text-xs text-muted">{p.subject}</div></td>
                      <td className="py-2 pr-2">{p.absentFaculty?.name}</td>
                      <td className="py-2 pr-2">
                        {p.assignedTo?.name || p.offeredTo?.name || '—'}
                        {p.history.length > 1 && (
                          <div className="text-xs text-muted">{p.history.filter((h) => h.action === 'declined' || h.action === 'no-reply').length} passed on</div>
                        )}
                      </td>
                      <td className="py-2 pr-2"><StatusBadge status={p.status} /></td>
                      <td className="py-2 text-right">
                        {p.status === 'pending' && (
                          <button onClick={() => skip(p._id)} className="whitespace-nowrap text-xs font-semibold text-brass-2 hover:underline">
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
          <Card title="Weekly note">
            {summary ? <p className="text-sm text-ink/80">{summary}</p> : <p className="text-sm text-muted">Get a quick summary of coverage and fairness.</p>}
            <Button className="mt-3" variant="ghost" disabled={summaryBusy} onClick={getSummary}>
              {summaryBusy ? 'Preparing…' : summary ? 'Refresh note' : 'Prepare note'}
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
