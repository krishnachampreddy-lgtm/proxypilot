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

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500';
const link = 'font-medium text-indigo-600 hover:underline';
const ROLE = { faculty: 'Faculty', hod: 'HOD', student: 'Student' };

function Avatar({ name, src }) {
  if (src) return <img src={src} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />;
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default function Login() {
  const { login, setSession, saved, quickLogin, forget } = useAuth();
  const [config, setConfig] = useState({ googleClientId: null, emailEnabled: false });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/auth/config').then((r) => setConfig(r.data)).catch(() => {});
  }, []);

  const run = async (fn) => {
    setBusy(true);
    setError('');
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

  const sendOtp = () =>
    run(async () => {
      if (name.trim().length < 2) throw { response: { data: { error: 'Please enter your name' } } };
      await api.post('/auth/email-code', { email, purpose: 'login' });
      setCodeSent(true);
      setCode('');
      setNotice(`OTP sent to ${email}. Check your inbox (and spam).`);
    });

  const submit = (e) => {
    e.preventDefault();
    if (!codeSent) return sendOtp();
    run(async () => setSession((await api.post('/auth/email-login', { email, code, name: name.trim() })).data));
  };

  const openSaved = (a) =>
    run(async () => {
      try {
        await quickLogin(a);
      } catch {
        // session expired: ask for a fresh OTP, details pre-filled
        setName(a.name);
        setEmail(a.email);
        setCodeSent(false);
        throw { response: { data: { error: `Your session expired. Tap "Send OTP" to sign in again as ${a.name}.` } } };
      }
    });

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
          {saved.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-sm font-medium text-slate-600">Continue as</p>
              <div className="space-y-2">
                {saved.map((a) => (
                  <div key={a.email} className="flex items-center gap-2">
                    <button disabled={busy} onClick={() => openSaved(a)} className="flex flex-1 items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-indigo-400 hover:bg-indigo-50">
                      <Avatar name={a.name} src={a.avatar} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-800">{a.name}</span>
                        <span className="block truncate text-xs text-slate-500">{a.email}{a.role ? ` · ${ROLE[a.role]}` : ''}</span>
                      </span>
                    </button>
                    <button onClick={() => forget(a.email)} title="Remove from this device" className="rounded-lg px-2 py-1 text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <GmailIcon className="h-8 w-8" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{codeSent ? 'Enter your OTP' : 'Sign in with Gmail'}</h2>
                <p className="text-sm text-slate-500">{codeSent ? 'We emailed you a 6-digit code' : 'No password — we’ll email you a one-time code'}</p>
              </div>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {!codeSent ? (
                <>
                  <input className={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  <input className={input} type="email" placeholder="yourname@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </>
              ) : (
                <input className={`${input} text-center text-2xl tracking-[0.5em]`} inputMode="numeric" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
              )}

              {notice && codeSent && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div>}
              <ErrorBox text={error} />

              <Button type="submit" disabled={busy || (codeSent && code.length !== 6)} className="w-full">
                {busy ? 'Please wait…' : codeSent ? 'Verify & sign in' : 'Send OTP'}
              </Button>

              {codeSent && (
                <div className="flex justify-between text-sm">
                  <button type="button" className={link} onClick={() => { setCodeSent(false); setError(''); }}>Change email</button>
                  <button type="button" className={link} disabled={busy} onClick={sendOtp}>Resend OTP</button>
                </div>
              )}
            </form>

            {config.googleClientId && (
              <>
                <div className="flex items-center gap-3 text-xs uppercase text-slate-400">
                  <div className="h-px flex-1 bg-slate-200" /> or <div className="h-px flex-1 bg-slate-200" />
                </div>
                <GoogleButton clientId={config.googleClientId} onCredential={onGoogle} onError={setError} />
              </>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-600">Demo accounts (one click)</p>
            <div className="grid gap-2">
              {DEMO.map((d) => (
                <button key={d.email} disabled={busy} onClick={() => run(() => login(d.email, 'demo123'))} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left hover:border-indigo-400 hover:bg-indigo-50">
                  <span className="text-sm font-semibold text-slate-800">{d.label}</span>
                  <span className="text-xs text-slate-500">{d.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
