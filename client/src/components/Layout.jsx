import { useAuth } from '../auth.jsx';
import CampusScene, { timeOfDayNow } from './campus/CampusScene.jsx';
import NotificationBell from './NotificationBell.jsx';
import InstallButton from './InstallButton.jsx';

// Mark: a 3x3 timetable with one period covered in brass
export function Mark({ className = 'h-8 w-8', dark = false }) {
  const base = dark ? '#edf2ec' : '#edf2ec';
  const cells = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      cells.push(<rect key={`${r}${c}`} x={4 + c * 9} y={4 + r * 9} width="7" height="7" rx="1.6" fill={r === 1 && c === 2 ? '#f4c542' : base} opacity={r === 1 && c === 2 ? 1 : 0.85 - r * 0.15} />);
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
      <span className="font-mono text-[13px] font-medium uppercase tracking-[0.18em] text-ink">ProxyPilot</span>
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const roleLabel = { faculty: 'Faculty', hod: 'Head of Department', student: 'Student' }[user.role];
  return (
    <div className="relative min-h-screen">
      {/* the school campus slowly circles behind the app; a dark wash keeps text readable */}
      <CampusScene mode="ambient" time={timeOfDayNow()} className="fixed inset-0 -z-20" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(180deg,rgba(5,9,7,0.35)_0%,rgba(5,9,7,0.78)_38%,rgba(5,9,7,0.9)_100%)]" />
      <header className="glass sticky top-0 z-10 border-x-0 border-t-0">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right md:block">
              <div className="text-sm font-semibold text-ink">{user.name}</div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-muted">
                {roleLabel}
                {user.className ? ` · ${user.className}` : ''}
              </div>
            </div>
            <InstallButton />
            <NotificationBell />
            <button onClick={logout} className="h-9 rounded-[11px] border border-line bg-white px-3 text-sm text-ink hover:border-brass/60">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
