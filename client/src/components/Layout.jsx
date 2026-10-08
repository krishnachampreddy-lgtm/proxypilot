import { useAuth } from '../auth.jsx';
import AmbientScene from './AmbientScene.jsx';

// Mark: a 3x3 timetable with one period covered in brass
export function Mark({ className = 'h-8 w-8', dark = false }) {
  const base = dark ? '#2a4166' : '#13233a';
  const cells = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      cells.push(<rect key={`${r}${c}`} x={4 + c * 9} y={4 + r * 9} width="7" height="7" rx="1.6" fill={r === 1 && c === 2 ? '#c8973f' : base} opacity={r === 1 && c === 2 ? 1 : 0.85 - r * 0.15} />);
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      {cells}
    </svg>
  );
}

export function Logo({ dark = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <Mark dark={dark} />
      <span className={`font-display text-[1.35rem] font-medium tracking-tight ${dark ? 'text-paper' : 'text-ink'}`}>
        ProxyPilot
      </span>
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const roleLabel = { faculty: 'Faculty', hod: 'Head of Department', student: 'Student' }[user.role];
  return (
    <div className="relative min-h-screen">
      {/* calm, light version of the timetable scene behind the app */}
      <AmbientScene theme="light" intensity={0.6} className="fixed inset-x-0 top-0 -z-10 h-[46vh] opacity-80 [mask-image:linear-gradient(to_bottom,black_40%,transparent)]" />
      <header className="sticky top-0 z-10 border-b border-line/80 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold text-ink">{user.name}</div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-muted">
                {roleLabel}
                {user.className ? ` · ${user.className}` : ''}
              </div>
            </div>
            <button onClick={logout} className="rounded-md border border-line bg-white/70 px-3 py-1.5 text-sm text-ink hover:border-ink/40">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
