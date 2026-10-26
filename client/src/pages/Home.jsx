import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import CampusScene, { timeOfDayNow } from '../components/campus/CampusScene.jsx';
import { STOPS } from '../campus/stops.js';
import { createSoundscape } from '../components/campus/sound.js';
import InstallButton from '../components/InstallButton.jsx';
import { Logo } from '../components/Layout.jsx';

const STEPS = [
  ['01', 'Teacher applies', 'Picks a date — full day, a session, a few periods or several days. Or taps “I’m sick today”.'],
  ['02', 'HOD approves', 'The request lands on the HOD’s dashboard with the classes affected. Declining needs a reason.'],
  ['03', 'Substitute found', 'Each class goes to the fairest free teacher of the same subject first, other subjects as backup.'],
  ['04', 'Everyone knows', 'The substitute accepts in the app, students see the change, and it’s all on record.'],
];

const FEATURES = [
  ['Fair by design', 'Ranks free teachers by subject, whether they know the class, and how many proxies they took this month.'],
  ['No calls, no chains', 'Requests appear in the app with a bell. A decline or no reply passes it to the next teacher.'],
  ['Never an empty class', 'If nobody at all can cover a class, that day’s leave is declined with a clear reason.'],
  ['Leave balance', '12 leaves a year — a full day counts 1, a session ½. Teachers see what’s left before applying.'],
  ['Monthly report', 'One click gives the HOD every leave, decision, substitute and class covered, ready for Excel.'],
  ['Works like an app', 'Install it on any phone. Sign in with a one-time code to your Gmail — no passwords.'],
];

const ROLES = [
  ['Teachers', 'Apply in seconds, see your balance, get cover requests and handover notes in one place.'],
  ['HOD', 'Approve with one tap, watch coverage live, keep proxy load fair, download the monthly report.'],
  ['Students', 'See who is taking your class before the bell rings.'],
];

const pill = 'rounded-[9px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition';

function Action({ to, onClick, title, sub, primary }) {
  const cls = `group flex w-full items-center justify-between gap-4 rounded-[11px] border px-4 py-3 text-left transition ${
    primary ? 'border-brass/70 bg-brass text-paper hover:brightness-110' : 'border-[rgb(200_235_220/0.16)] bg-[rgb(8_14_12/0.45)] text-ink hover:border-brass/60'
  }`;
  const body = (
    <>
      <span className="text-[15px] font-semibold">{title}</span>
      <span className={`hidden font-mono text-[10px] uppercase tracking-[0.14em] sm:inline ${primary ? 'text-paper/70' : 'text-muted'}`}>{sub}</span>
    </>
  );
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

export default function Home() {
  const [time, setTime] = useState(timeOfDayNow);
  const [stop, setStop] = useState(null); // index of the tour stop, or null
  const [soundOn, setSoundOn] = useState(false);
  const [progress, setProgress] = useState(0);
  const scene = useRef(null);
  const audio = useRef(null);

  // sound follows the time of day
  useEffect(() => {
    audio.current?.setTime(time);
  }, [time]);
  useEffect(() => () => audio.current?.stop(), []);

  const toggleSound = () => {
    if (soundOn) {
      audio.current?.stop();
      audio.current = null;
      setSoundOn(false);
    } else {
      audio.current = createSoundscape();
      audio.current?.setTime(time);
      setSoundOn(Boolean(audio.current));
    }
  };

  const goTo = (i) => {
    setStop(i);
    setTime(i === STOPS.length - 1 ? 'evening' : 'morning');
    scene.current?.goTo(i);
    audio.current?.bell();
  };
  const endTour = () => {
    setStop(null);
    scene.current?.endTour();
  };

  // the tour moves on by itself every few seconds
  useEffect(() => {
    if (stop === null) return;
    const t = setTimeout(() => (stop < STOPS.length - 1 ? goTo(stop + 1) : endTour()), 9000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stop]);

  const s = stop !== null ? STOPS[stop] : null;

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* ---------- living campus ---------- */}
      <section className="relative h-[100svh] min-h-[600px] overflow-hidden">
        <CampusScene ref={scene} time={time} className="absolute inset-0" onProgress={setProgress} />
        {progress > 0 && progress < 1 && (
          <div className="pointer-events-none absolute left-1/2 top-20 z-10 -translate-x-1/2 sm:top-24">
            <div className="glass flex items-center gap-3 rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/80">
              <span>Opening the school gates</span>
              <span className="h-1 w-24 overflow-hidden rounded-full bg-ink/15"><span className="block h-full bg-brass transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,7,0.45)_0%,transparent_22%,transparent_50%,rgba(5,8,7,0.7)_100%)]" />

        <nav className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-4 py-4 sm:px-8 sm:py-6">
          <Logo />
          <div className="flex items-center gap-2">
            <div className="glass hidden rounded-[11px] p-1 sm:flex">
              {[
                ['morning', 'Morning assembly'],
                ['evening', 'Evening'],
              ].map(([key, label]) => (
                <button key={key} onClick={() => setTime(key)} className={`${pill} ${time === key ? 'bg-ink text-paper' : 'text-ink/80 hover:text-ink'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setTime(time === 'morning' ? 'evening' : 'morning')}
              className="glass flex h-9 w-9 items-center justify-center rounded-[11px] text-base sm:hidden"
              aria-label={time === 'morning' ? 'Switch to evening' : 'Switch to morning'}
            >
              {time === 'morning' ? '☀' : '☾'}
            </button>
            <button onClick={toggleSound} className="glass flex h-9 items-center gap-1.5 rounded-[11px] px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink/85 hover:text-ink" aria-pressed={soundOn}>
              <span aria-hidden="true">{soundOn ? '🔊' : '🔈'}</span>
              <span className="hidden sm:inline">Sound</span>
            </button>
            <Link to="/login" className="flex h-9 items-center rounded-[11px] bg-ink px-4 text-sm font-semibold text-paper hover:bg-ink-3">
              Log in
            </Link>
          </div>
        </nav>

        {/* hero card, or the tour caption while touring */}
        <div className="absolute inset-x-3 bottom-3 z-10 sm:inset-x-auto sm:bottom-8 sm:left-8 sm:w-[min(560px,calc(100vw-4rem))]">
          {s ? (
            <div className="glass rounded-[14px] p-5 sm:p-6" aria-live="polite">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-brass">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass" />
                  Stop {stop + 1} / {STOPS.length} · {s.time}
                </span>
                <button onClick={endTour} className="text-lg leading-none text-muted hover:text-ink" aria-label="Stop the tour">
                  ×
                </button>
              </div>
              <h2 className="mt-2 font-display text-4xl leading-none">{s.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink/80">{s.text}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <div className="flex gap-1.5">
                  {STOPS.map((_, i) => (
                    <button key={i} onClick={() => goTo(i)} aria-label={`Go to stop ${i + 1}`} className={`h-1.5 rounded-full transition-all ${i === stop ? 'w-6 bg-brass' : 'w-1.5 bg-ink/30 hover:bg-ink/60'}`} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={endTour} className="rounded-[11px] border border-line px-3 py-1.5 text-sm text-ink/80 hover:text-ink">
                    Stop
                  </button>
                  <button onClick={() => (stop < STOPS.length - 1 ? goTo(stop + 1) : endTour())} className="rounded-[11px] bg-ink px-4 py-1.5 text-sm font-semibold text-paper hover:bg-ink-3">
                    {stop < STOPS.length - 1 ? 'Next ›' : 'Finish'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass rounded-[14px] p-5 sm:p-7">
              <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink/75">
                <span className="h-1.5 w-1.5 rounded-full bg-sage shadow-[0_0_10px_2px_rgba(98,211,155,0.6)]" />
                Every class, covered
              </p>
              <h1 className="mt-3 text-[2.6rem] font-medium uppercase leading-none tracking-tight sm:text-6xl">ProxyPilot</h1>
              <p className="mt-3 font-display text-2xl italic leading-tight sm:text-[1.9rem]">
                A teacher takes leave. <span className="text-brass">The class still happens.</span>
              </p>
              <p className="mt-3 hidden text-[15px] leading-relaxed text-ink/75 sm:block">
                Leave goes to the HOD, the fairest free colleague is found for every class, and students know before the bell — without a single phone call.
              </p>
              <div className="mt-5 space-y-2">
                <Action to="/login#demo" primary title="Try the demo" sub="One tap · no sign-up" />
                <Action to="/login" title="Sign in with Gmail" sub="Teacher · HOD · Student" />
                <Action onClick={() => goTo(0)} title="Take the campus tour" sub={`Guided · ${STOPS.length} stops`} />
              </div>
            </div>
          )}
        </div>

        <p className="pointer-events-none absolute bottom-8 right-8 z-10 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-ink/60 lg:block">
          Drag to look around · scroll for more ↓
        </p>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-16 lg:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-brass">How it works</p>
        <h2 className="mt-2 font-display text-4xl sm:text-5xl">From leave request to covered class</h2>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([n, title, body]) => (
            <li key={n} className="glass rounded-[14px] p-5">
              <span className="font-mono text-sm text-brass">{n}</span>
              <h3 className="mt-2 font-display text-2xl">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- features: a chalkboard ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-16 lg:px-8">
        <div className="rounded-[14px] border-[6px] border-[#6b4a32] bg-board p-6 shadow-[inset_0_0_80px_rgba(0,0,0,0.45)] sm:p-10">
          <h2 className="font-display text-4xl text-[#f3f0e4] sm:text-5xl">Built around how schools really work</h2>
          <div className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([title, body]) => (
              <div key={title} className="border-l-2 border-brass pl-4">
                <h3 className="text-base font-semibold text-[#f3f0e4]">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#f3f0e4]/70">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- roles ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-16 lg:px-8">
        <h2 className="font-display text-4xl sm:text-5xl">One app, three views</h2>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {ROLES.map(([who, body]) => (
            <div key={who} className="glass rounded-[14px] p-6">
              <h3 className="font-display text-3xl text-brass">{who}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/75">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- call to action ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-20 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-5 rounded-[14px] border border-brass/50 bg-brass-soft p-8 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-3xl">See it in two minutes</h2>
            <p className="mt-1 text-sm text-ink/70">Log in as a teacher, the HOD or a student with one tap — no sign-up needed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/login#demo" className="rounded-[11px] bg-brass px-5 py-2.5 text-sm font-semibold text-paper hover:brightness-110">
              Try the demo
            </Link>
            <InstallButton variant="hero" />
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <Logo />
          <span>Leave requests, HOD approval and substitute lectures — automated.</span>
        </div>
      </footer>
    </div>
  );
}
