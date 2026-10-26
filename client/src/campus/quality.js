/*
  Device profiles. Most college laptops run Intel UHD graphics and most phones run
  mid-range Mali/Adreno chips, so "medium" is designed to stay smooth on those.
  The scene also watches its own frame rate and steps down while running (see Governor).
*/

export const PROFILES = {
  ultra: { name: 'ultra', crowd: 220, peopleLod: 0.4, crowdLod: 0.2, branch: 1, dpr: 1.5, ao: 'Medium', aoHalf: false, bloom: true, aa: 'smaa', shadow: 4096, shadowEvery: 1, grass: 42000, farTrees: 260, nearLeaves: 1.25, walkers: 24, traffic: 14, townShadows: true, farTown: 1400 },
  high: { name: 'high', crowd: 170, peopleLod: 0.3, crowdLod: 0.14, branch: 0.75, dpr: 1.25, ao: 'Low', aoHalf: true, bloom: true, aa: 'smaa', shadow: 2048, shadowEvery: 1, grass: 20000, farTrees: 160, nearLeaves: 0.9, walkers: 20, traffic: 12, townShadows: false, farTown: 1100 },
  medium: { name: 'medium', crowd: 120, peopleLod: 0.2, crowdLod: 0.1, branch: 0.5, dpr: 1.0, ao: null, bloom: true, aa: 'fxaa', shadow: 2048, shadowEvery: 2, grass: 0, farTrees: 70, nearLeaves: 0.6, walkers: 16, traffic: 8, townShadows: false, farTown: 800 },
  low: { name: 'low', crowd: 64, peopleLod: 0.14, crowdLod: 0.07, branch: 0.4, dpr: 0.85, ao: null, bloom: false, aa: 'fxaa', shadow: 1024, shadowEvery: 3, grass: 0, farTrees: 30, nearLeaves: 0.45, walkers: 12, traffic: 6, townShadows: false, farTown: 420 },
  still: { name: 'still', crowd: 220, peopleLod: 0.5, crowdLod: 0.3, branch: 1, dpr: 1, ao: 'Ultra', aoHalf: false, bloom: true, aa: 'smaa', shadow: 4096, shadowEvery: 1, grass: 42000, farTrees: 260, nearLeaves: 1.25, walkers: 24, traffic: 14, townShadows: true, farTown: 1400 },
};

/** Picks a profile from the graphics chip, screen and memory. `?q=ultra|high|medium|low` forces one. */
export function detectProfile() {
  const forced = new URLSearchParams(window.location.search).get('q');
  if (forced && PROFILES[forced]) return PROFILES[forced];
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 8;
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    gpu = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER)) || '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* unknown chip */
  }
  const strong = /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|apple m\d (pro|max|ultra)/i.test(gpu);
  const decent = /apple m\d|apple gpu|iris xe|arc|adreno \(tm\) (7[3-9]\d|8\d\d)/i.test(gpu);
  if (coarse) return mem >= 6 && decent ? PROFILES.medium : PROFILES.low;
  if (strong) return PROFILES.ultra;
  if (decent) return PROFILES.high;
  return mem <= 4 ? PROFILES.low : PROFILES.medium;
}

/**
 * Keeps the frame rate up while the scene runs: when the last two seconds averaged
 * under ~40 fps it lowers the resolution, then switches off the expensive effects,
 * one step at a time. When there's plenty of headroom it slowly gives resolution back.
 */
export class Governor {
  constructor({ minDpr = 0.6, maxDpr = 1, onChange }) {
    this.minDpr = minDpr;
    this.maxDpr = maxDpr;
    this.dpr = maxDpr;
    this.onChange = onChange;
    this.frames = 0;
    this.time = 0;
    this.goodStreak = 0;
    this.step = 0; // 0 = nothing switched off yet
    this.warmup = 2.5; // ignore the first seconds (shader compile, texture upload)
  }
  tick(dt) {
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    this.frames++;
    this.time += dt;
    if (this.time < 2) return;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    this.fps = fps;
    if (fps < 40) {
      this.goodStreak = 0;
      if (this.dpr > this.minDpr + 0.01) {
        this.dpr = Math.max(this.minDpr, this.dpr - (fps < 25 ? 0.2 : 0.1));
        this.onChange({ dpr: this.dpr });
      } else {
        this.step++;
        this.onChange({ step: this.step });
      }
    } else if (fps > 57) {
      this.goodStreak++;
      if (this.goodStreak >= 3 && this.dpr < this.maxDpr - 0.01 && this.step === 0) {
        this.dpr = Math.min(this.maxDpr, this.dpr + 0.1);
        this.goodStreak = 0;
        this.onChange({ dpr: this.dpr });
      }
    } else {
      this.goodStreak = 0;
    }
  }
}
