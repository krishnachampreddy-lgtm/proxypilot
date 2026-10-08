import { useAuth } from '../auth.jsx';

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-8 w-8">
        <rect width="32" height="32" rx="8" fill="#4f46e5" />
        <path d="M9 22l7-12 7 12h-4.5L16 17.5 13.5 22z" fill="#fff" />
      </svg>
      <span className="text-lg font-bold text-slate-900">
        Proxy<span className="text-indigo-600">Pilot</span>
      </span>
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const roleLabel = { faculty: 'Faculty', hod: 'Head of Department', student: 'Student' }[user.role];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold text-slate-800">{user.name}</div>
              <div className="text-xs text-slate-500">{roleLabel}{user.className ? ` · ${user.className}` : ''}</div>
            </div>
            <button onClick={logout} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
