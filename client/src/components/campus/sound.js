// Gentle campus soundscape made in the browser (no audio files):
// soft wind, birds in the morning, crickets in the evening, and a school bell.
export function createSoundscape() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 1.2);

  // wind: filtered noise
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.18;
  noise.connect(lp).connect(windGain).connect(master);
  noise.start();

  let evening = 0;

  const chirp = () => {
    const t = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2400 + Math.random() * 1800;
    for (let n = 0; n < notes; n++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const s = t + n * (0.09 + Math.random() * 0.05);
      o.type = 'sine';
      o.frequency.setValueAtTime(base, s);
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.4), s + 0.07);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.06 * (1 - evening), s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
      o.connect(g).connect(master);
      o.start(s);
      o.stop(s + 0.12);
    }
  };

  const cricket = () => {
    const t = ctx.currentTime;
    for (let n = 0; n < 3; n++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const s = t + n * 0.06;
      o.type = 'triangle';
      o.frequency.value = 4300 + Math.random() * 300;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.025 * evening, s + 0.008);
      g.gain.linearRampToValueAtTime(0, s + 0.04);
      o.connect(g).connect(master);
      o.start(s);
      o.stop(s + 0.05);
    }
  };

  const timer = setInterval(() => {
    if (Math.random() < 0.55 * (1 - evening)) chirp();
    if (Math.random() < 0.9 * evening) cricket();
  }, 450);

  return {
    setTime(name) {
      evening = name === 'evening' ? 1 : 0;
      windGain.gain.linearRampToValueAtTime(evening ? 0.1 : 0.18, ctx.currentTime + 1.5);
    },
    bell() {
      const t = ctx.currentTime;
      for (const [f, a] of [[880, 0.16], [1320, 0.08], [1760, 0.04]]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(a, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + 2.5);
      }
    },
    stop() {
      clearInterval(timer);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      setTimeout(() => ctx.close(), 500);
    },
  };
}
