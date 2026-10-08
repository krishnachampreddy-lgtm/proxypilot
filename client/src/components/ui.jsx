export function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS = {
  accepted: ['Covered', 'bg-emerald-100 text-emerald-800'],
  pending: ['Waiting for reply', 'bg-amber-100 text-amber-800'],
  uncovered: ['Not covered', 'bg-rose-100 text-rose-800'],
};

export function StatusBadge({ status }) {
  const [label, cls] = STATUS[status] || [status, 'bg-slate-100 text-slate-700'];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function AiBadge({ used = true }) {
  return used ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
      ✦ AI
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">rules</span>
  );
}

export function ErrorBox({ text }) {
  if (!text) return null;
  return <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{text}</div>;
}

export function Empty({ children }) {
  return <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300',
    ghost: 'border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50',
  };
  return <button className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${styles[variant]} ${className}`} {...props} />;
}
