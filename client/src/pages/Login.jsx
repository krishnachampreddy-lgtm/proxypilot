import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import api, { errorText } from '../api';
import { Logo } from '../components/Layout.jsx';
import { Button, ErrorBox } from '../components/ui.jsx';
import GoogleButton, { GmailIcon } from '../components/GoogleButton.jsx';

const DEMO = [
  { label: 'Dr. Anita Mehta', role: 'Faculty · applies leave', email: 'mehta@college.edu' },
  { label: 'Prof. Ravi Rao', role: 'Faculty · gets proxy requests', email: 'rao@college.edu' },
  { label: 'Prof. Farhan Ali', role: 'Faculty · gets proxy requests', email: 'ali@college.edu' },
  { label: 'Dr. Rajesh Kumar', role: 'HOD · dashboard', email: 'hod@college.edu' },
  { label: 'Aarav Sharma', role: 'Student · CSE-2A', email: 'aarav@college.edu' },
];

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500';
const link = 'font-medium text-indigo-600 hover:underline';

function Notice({ text }) {
  if (!text) return null;
  return <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{text}</div>;
}

export default function Login() {
  const { login, setSession } = useAuth();
  const [mode, setMode] = useState('login'); // login | signup | gmail | forgot
  const [config, setConfig] = useState({ googleClientId: null, emailEnabled: false });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // shared form state
  const [f, setF] = useState({ name: '', email: '', password: '', code: '', role: 'faculty', className: 'CSE-2A', subjects: '' });
  const [codeSent, setCodeSent] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    api.get('/auth/config').then((r) => setConfig(r.data)).catch(() => {});
  }, []);

  const go = (m) => {
    setMode(m);
    setError('');
    setNotice('');
    setCodeSent(false);
    setF((s) => ({ ...s, password: '', code: '' }));
  };

  const run = async (fn) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = useCallback(
    (credential) => run(async () => setSession((await api.post('/auth/google', { credential })).data)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const sendCode = (purpose) =>
    run(async () => {
      await api.post('/auth/email-code', { email: f.email, purpose });
      setCodeSent(true);
      setNotice(`We sent a 6-digit code to ${f.email}. Check your inbox (and spam).`);
    });

  const submit = (e) => {
    e.preventDefault();
    if (mode === 'login') return run(() => login(f.email, f.password));
    if (mode === 'signup')
      return run(async () =>
        setSession(
          (
            await api.post('/auth/signup', {
              name: f.name,
              email: f.email,
              password: f.password,
              role: f.role,
              className: f.role === 'student' ? f.className : undefined,
              subjects: f.role === 'faculty' ? f.subjects.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
            })
          ).data
        )
      );
    if (mode === 'gmail') {
      if (!codeSent) return sendCode('login');
      return run(async () => setSession((await api.post('/auth/email-login', { email: f.email, code: f.code })).data));
    }
    if (mode === 'forgot') {
      if (!codeSent) return sendCode('reset');
      return run(async () => setSession((await api.post('/auth/reset-password', { email: f.email, code: f.code, password: f.password })).data));
    }
  };

  const demo = (email) => run(() => login(email, 'demo123'));

  const titles = {
    login: ['Welcome back', 'Log in to ProxyPilot'],
    signup: ['Create your account', 'For faculty and students'],
    gmail: ['Continue with Gmail', 'We’ll email you a 6-digit code — no password needed'],
    forgot: ['Reset your password', 'We’ll email you a code to set a new password'],
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between bg-gradient-to-br from-indigo-700 to-indigo-900 p-8 text-white lg:p-12">
        <div className="self-start rounded-xl bg-white/95 px-3 py-2"><Logo /></div>
        <div className="my-10">
          <h1 className="text-3xl font-bold leading-tight lg:text-4xl">One leave message in.<br />Class covered in 40 seconds.</h1>
          <p className="mt-4 max-w-md text-indigo-100">
            ProxyPilot reads a teacher's leave message, finds the fairest free substitute for every class,
            gets them to confirm, and tells the students — no WhatsApp chasing, no phone calls.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-indigo-100">
            <li>✦ AI understands leave written in plain words</li>
            <li>✦ Fair ranking: subject match, workload, proxies this month</li>
            <li>✦ Auto-passes to the next teacher if someone says no</li>
            <li>✦ HOD dashboard with fairness insights</li>
          </ul>
        </div>
        <p className="text-xs text-indigo-200">Smart Automation Scenario Challenge · prototype</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{titles[mode][0]}</h2>
              <p className="text-sm text-slate-500">{titles[mode][1]}</p>
            </div>

            {(mode === 'login' || mode === 'signup') && (
              <>
                <GoogleButton clientId={config.googleClientId} onCredential={onGoogle} onError={setError} />
                {config.emailEnabled && <button type="button" onClick={() => go('gmail')} className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <GmailIcon /> Continue with Gmail
                </button>}
                <div className="flex items-center gap-3 text-xs uppercase text-slate-400">
                  <div className="h-px flex-1 bg-slate-200" /> or <div className="h-px flex-1 bg-slate-200" />
                </div>
              </>
            )}

            <form onSubmit={submit} className="space-y-3">
              {mode === 'signup' && <input className={input} placeholder="Full name" value={f.name} onChange={set('name')} />}

              <input className={input} type="email" placeholder={mode === 'gmail' ? 'yourname@gmail.com' : 'Email'} value={f.email} onChange={set('email')} disabled={codeSent} />

              {(mode === 'gmail' || mode === 'forgot') && codeSent && (
                <input className={`${input} text-center text-lg tracking-[0.5em]`} inputMode="numeric" maxLength={6} placeholder="••••••" value={f.code} onChange={set('code')} autoFocus />
              )}

              {(mode === 'login' || mode === 'signup' || (mode === 'forgot' && codeSent)) && (
                <input className={input} type="password" placeholder={mode === 'forgot' ? 'New password (min 6 characters)' : 'Password'} value={f.password} onChange={set('password')} />
              )}

              {mode === 'login' && config.emailEnabled && (
                <div className="text-right text-sm">
                  <button type="button" className={link} onClick={() => go('forgot')}>Forgot password?</button>
                </div>
              )}

              {mode === 'signup' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {['faculty', 'student'].map((r) => (
                      <button type="button" key={r} onClick={() => setF((s) => ({ ...s, role: r }))} className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize ${f.role === r ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-600'}`}>
                        I'm {r === 'faculty' ? 'faculty' : 'a student'}
                      </button>
                    ))}
                  </div>
                  {f.role === 'faculty' ? (
                    <input className={input} placeholder="Subjects you teach, e.g. DBMS, DSA" value={f.subjects} onChange={set('subjects')} />
                  ) : (
                    <select className={input} value={f.className} onChange={set('className')}>
                      {['CSE-2A', 'CSE-2B', 'CSE-3A', 'CSE-3B'].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  )}
                </>
              )}

              <Notice text={notice} />
              <ErrorBox text={error} />

              <Button type="submit" disabled={busy} className="w-full">
                {busy
                  ? 'Please wait…'
                  : { login: 'Log in', signup: 'Create account', gmail: codeSent ? 'Verify & continue' : 'Send me a code', forgot: codeSent ? 'Set new password' : 'Send reset code' }[mode]}
              </Button>

              {codeSent && (
                <div className="flex justify-between text-sm">
                  <button type="button" className={link} onClick={() => { setCodeSent(false); setNotice(''); }}>Change email</button>
                  <button type="button" className={link} disabled={busy} onClick={() => sendCode(mode === 'gmail' ? 'login' : 'reset')}>Resend code</button>
                </div>
              )}
            </form>

            <p className="text-center text-sm text-slate-600">
              {mode === 'login' ? (
                <>New here? <button className={link} onClick={() => go('signup')}>Create an account</button></>
              ) : (
                <>Back to <button className={link} onClick={() => go('login')}>log in</button></>
              )}
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-600">Demo accounts (one click)</p>
            <div className="grid gap-2">
              {DEMO.map((d) => (
                <button key={d.email} disabled={busy} onClick={() => demo(d.email)} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left hover:border-indigo-400 hover:bg-indigo-50">
                  <span className="text-sm font-semibold text-slate-800">{d.label}</span>
                  <span className="text-xs text-slate-500">{d.role}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">All demo passwords: demo123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
