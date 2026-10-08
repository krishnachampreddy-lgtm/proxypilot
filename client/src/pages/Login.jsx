import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import api, { errorText } from '../api';
import { Logo } from '../components/Layout.jsx';
import AmbientScene from '../components/AmbientScene.jsx';
import { Button, ErrorBox } from '../components/ui.jsx';
import GoogleButton from '../components/GoogleButton.jsx';

const DEMO = [
  { label: 'Dr. Anita Mehta', role: 'Faculty · applies leave', email: 'mehta@college.edu' },
  { label: 'Prof. Ravi Rao', role: 'Faculty · gets proxy requests', email: 'rao@college.edu' },
  { label: 'Prof. Farhan Ali', role: 'Faculty · gets proxy requests', email: 'ali@college.edu' },
  { label: 'Dr. Rajesh Kumar', role: 'HOD · dashboard', email: 'hod@college.edu' },
  { label: 'Aarav Sharma', role: 'Student · CSE-2A', email: 'aarav@college.edu' },
];

const input = 'w-full rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-ink';
const link = 'font-medium text-brass-2 hover:underline';
const ROLE = { faculty: 'Faculty', hod: 'HOD', student: 'Student' };

function Avatar({ name, src }) {
  if (src) return <img src={src} alt="" className="h-9 w-9 rounded-full" referrerPolicy="no-referrer" />;
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-display text-sm text-brass">
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
    <div className="relative min-h-screen overflow-hidden bg-ink text-paper">
      <AmbientScene theme="dark" className="absolute inset-0" />
      {/* soft vignette so text stays readable over the scene */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,transparent_0%,rgba(11,22,38,0.35)_55%,rgba(11,22,38,0.85)_100%)]" />
      <div className="grain pointer-events-none absolute inset-0" />

      <div className="relative mx-auto grid min-h-screen max-w-6xl gap-10 px-5 py-8 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:px-8">
        <section className="flex flex-col justify-between gap-10 lg:min-h-[78vh]">
          <Logo dark />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-brass">Proxy lectures, handled</p>
            <h1 className="mt-4 font-display text-[2.6rem] font-normal leading-[1.05] tracking-tight text-paper sm:text-6xl">
              Every class,<br />
              <em className="font-normal text-brass">covered.</em>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-paper/70">
              A teacher writes one line about their leave. ProxyPilot reads it, finds the fairest free colleague for each period,
              gets a yes, and tells the class. No calls. No WhatsApp chains.
            </p>

            <div className="mt-8 max-w-sm rounded-md border border-paper/10 bg-ink-2/70 p-4 font-mono text-xs backdrop-blur">
              <div className="flex items-center justify-between text-paper/50">
                <span>TODAY · P4 · 11:50</span>
                <span className="flex items-center gap-1.5 text-sage"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage" /> live</span>
              </div>
              <div className="mt-3 text-paper/85">CSE-2B · DBMS</div>
              <div className="mt-1 text-paper/50 line-through">Dr. Anita Mehta</div>
              <div className="mt-1 text-brass">→ Prof. Ravi Rao accepted · 38 s</div>
            </div>
          </div>
          <p className="hidden font-mono text-[11px] uppercase tracking-wider text-paper/40 lg:block">Smart Automation Scenario Challenge</p>
        </section>

        <section className="w-full max-w-md justify-self-center lg:justify-self-end">
          <div className="space-y-4 rounded-lg bg-paper p-6 text-ink shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] sm:p-7">
            {saved.length > 0 && !codeSent && (
              <div>
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">Continue as</p>
                <div className="space-y-2">
                  {saved.map((a) => (
                    <div key={a.email} className="flex items-center gap-2">
                      <button disabled={busy} onClick={() => openSaved(a)} className="flex flex-1 items-center gap-3 rounded-md border border-line bg-white px-3 py-2 text-left transition hover:border-brass">
                        <Avatar name={a.name} src={a.avatar} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{a.name}</span>
                          <span className="block truncate text-xs text-muted">{a.email}{a.role ? ` · ${ROLE[a.role]}` : ''}</span>
                        </span>
                        <span className="text-brass-2">→</span>
                      </button>
                      <button onClick={() => forget(a.email)} title="Remove from this device" className="rounded px-2 py-1 text-lg text-muted hover:bg-paper-2 hover:text-ink">×</button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 h-px bg-line" />
              </div>
            )}

            <div>
              <h2 className="font-display text-2xl font-medium tracking-tight">{codeSent ? 'Check your inbox' : 'Sign in'}</h2>
              <p className="mt-1 text-sm text-muted">{codeSent ? `We sent a 6-digit code to ${email}.` : 'With your Gmail. No password needed.'}</p>
            </div>

            <form onSubmit={submit} className="space-y-3">
              {!codeSent ? (
                <>
                  <input className={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  <input className={input} type="email" placeholder="yourname@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </>
              ) : (
                <input className={`${input} text-center font-mono text-2xl tracking-[0.6em]`} inputMode="numeric" maxLength={6} placeholder="······" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
              )}

              {notice && codeSent && <p className="text-xs text-muted">Can’t see it? Check the Spam folder.</p>}
              <ErrorBox text={error} />

              <Button type="submit" disabled={busy || (codeSent && code.length !== 6)} className="w-full py-2.5">
                {busy ? 'Please wait…' : codeSent ? 'Verify & sign in' : 'Send OTP'}
              </Button>

              {codeSent && (
                <div className="flex justify-between text-sm">
                  <button type="button" className={link} onClick={() => { setCodeSent(false); setError(''); }}>Change email</button>
                  <button type="button" className={link} disabled={busy} onClick={sendOtp}>Resend code</button>
                </div>
              )}
            </form>

            {config.googleClientId && !codeSent && (
              <>
                <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-muted">
                  <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
                </div>
                <GoogleButton clientId={config.googleClientId} onCredential={onGoogle} onError={setError} />
              </>
            )}
          </div>

          <div className="mt-5">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-paper/50">Try the demo as</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {DEMO.map((d) => (
                <button key={d.email} disabled={busy} onClick={() => run(() => login(d.email, 'demo123'))} className="rounded-md border border-paper/15 bg-ink-2/60 px-3 py-2 text-left backdrop-blur transition hover:border-brass/70">
                  <span className="block truncate text-[13px] font-medium text-paper">{d.label}</span>
                  <span className="block truncate font-mono text-[10px] uppercase tracking-wide text-paper/45">{d.role.split(' · ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
