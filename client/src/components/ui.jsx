export function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`min-w-0 rounded-lg border border-line bg-white/90 p-5 shadow-[0_1px_0_rgba(11,22,38,0.04),0_8px_24px_-16px_rgba(11,22,38,0.25)] backdrop-blur-sm ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-medium text-ink">{title}</h2>
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const STATUS = {
  accepted: ['Covered', 'bg-sage-soft text-sage'],
  pending: ['Awaiting reply', 'bg-brass-soft text-brass-2'],
  uncovered: ['Not covered', 'bg-clay-soft text-clay'],
};

export function StatusBadge({ status }) {
  const [label, cls] = STATUS[status] || [status, 'bg-paper-2 text-ink'];
  return <span className={`inline-block rounded px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${cls}`}>{label}</span>;
}

export function AiBadge({ used = true }) {
  return used ? (
    <span className="inline-flex items-center gap-1 rounded border border-brass/40 bg-brass-soft px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-brass-2">
      ◆ Gemini
    </span>
  ) : (
    <span className="rounded border border-line bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">rules</span>
  );
}

export function ErrorBox({ text }) {
  if (!text) return null;
  return <div className="rounded-md border border-clay/30 bg-clay-soft px-3 py-2 text-sm text-clay">{text}</div>;
}

export function Empty({ children }) {
  return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-ink text-paper hover:bg-ink-3 disabled:bg-ink/40',
    success: 'bg-sage text-white hover:bg-sage/90 disabled:bg-sage/40',
    brass: 'bg-brass text-ink hover:bg-brass-2 hover:text-paper disabled:opacity-50',
    ghost: 'border border-line bg-white text-ink hover:border-ink/40 disabled:opacity-50',
  };
  return <button className={`rounded-md px-4 py-2 text-sm font-semibold transition ${styles[variant]} ${className}`} {...props} />;
}
