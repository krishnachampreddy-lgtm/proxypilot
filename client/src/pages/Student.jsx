import { useEffect, useState } from 'react';
import api, { errorText } from '../api';
import { Card, ErrorBox } from '../components/ui.jsx';

const CHANGE = {
  substitute: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  free: 'bg-rose-50 text-rose-800 border-rose-200',
};

export default function Student() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => api.get('/student/schedule').then((r) => setData(r.data)).catch((e) => setError(errorText(e)));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <p className="text-slate-500">{error || 'Loading…'}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Class {data.className} timetable</h1>
      <ErrorBox text={error} />
      <div className="grid gap-6 md:grid-cols-2">
        {data.days.map((d) => (
          <Card key={d.date} title={d.prettyDate}>
            {d.periods.length === 0 ? (
              <p className="text-sm text-slate-500">No classes.</p>
            ) : (
              <ul className="space-y-2">
                {d.periods.map((p) => (
                  <li key={p.period} className={`rounded-lg border px-3 py-2 text-sm ${p.change ? CHANGE[p.change.type] : 'border-slate-200'}`}>
                    <div className="flex justify-between">
                      <span className="font-semibold">P{p.period} · {p.subject}</span>
                      <span className="text-xs opacity-70">{p.time}</span>
                    </div>
                    <div className={p.change ? 'line-through opacity-60' : 'text-slate-600'}>{p.teacher}</div>
                    {p.change && <div className="font-medium">{p.change.text}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
