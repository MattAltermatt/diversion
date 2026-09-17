// Headless long-run harness for LICHEN #358 — the SHIPPED mechanics.
// Mirrors docs/mockups/2026-09-17-lichen-tide.html: sterile ground, timed spiral storm
// scrub with survivors, contact-margin-free (margins are render-only).
//
// ⚠️ An earlier version of this file measured a DIFFERENT simulation — instant storms
// with zero survivors and no sterile ground — and the spec quoted its table as evidence
// for the shipped design. Re-run this whenever a storm or rock mechanic changes.
//
// Usage: node <this file> [seed] [--json]

let rngState = 1;
const srand = s => { rngState = (s >>> 0) || 1; };
const rnd = () => {
  rngState ^= rngState << 13; rngState >>>= 0;
  rngState ^= rngState >> 17;
  rngState ^= rngState << 5;  rngState >>>= 0;
  return rngState / 4294967296;
};
const hash2 = (x, y, s) => {
    // >>> not >>. An ARITHMETIC shift sign-extends, so bit31 of `h ^ (h >> 16)` is
  // bit31(h) ^ bit31(h) = 0 — the top bit could never be set and this returned
  // [0, 0.5), never [0, 1). Everything downstream was half-scale: fbm, relief,
  // shade, the vein/speckle fields, `lobe`, and the storm survivor coin-flip, which
  // gave ~17% survivors against a documented 8.5%.
  let h = x * 374761393 + y * 668265263 + s * 1442695040;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, s, oct) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f, y * f, s + i * 31); norm += amp; amp *= 0.5; f *= 2; }
  return sum / norm;
}

const SPECIES = [
  { short: 'Verru', band: [0.72, 1.00], rate: 1.00 },
  { short: 'Calop', band: [0.46, 0.80], rate: 0.86 },
  { short: 'Xanth', band: [0.33, 0.62], rate: 0.74 },
  { short: 'Lecan', band: [0.16, 0.44], rate: 0.60 },
  { short: 'Ramal', band: [0.02, 0.28], rate: 0.52 },
];
const NS = SPECIES.length;
function habitability(sp, w) {
  const [lo, hi] = SPECIES[sp].band;
  if (w < lo || w > hi) {
    const d = w < lo ? lo - w : w - hi;
    return Math.max(0, 1 - d / 0.11) * 0.55;
  }
  const mid = (lo + hi) / 2, half = (hi - lo) / 2;
  return 0.72 + 0.28 * (1 - Math.abs(w - mid) / half);
}

const SURVIVE = 0.085, TURNS = 2.6, COIL = 0.55;
const NATURAL = ['band', 'plume', 'spatter', 'slab', 'swath'];
const WHIMSY  = ['checker', 'smiley', 'spiral', 'dots', 'bite'];

export function makeWorld(W, H, seed, cfg) {
  const N = W * H;
  const w = {
    W, H, N, seed, cfg,
    relief: new Float32Array(N), shade: new Float32Array(N),
    veinF: new Float32Array(N), speckF: new Float32Array(N),
    wet: new Float32Array(N), sterile: new Uint8Array(N),
    occ: new Int8Array(N).fill(-1), age: new Float32Array(N), scour: new Float32Array(N),
    waterRow: H * 0.88, simYears: 0, nextStorm: 6, storm: null,
    storms: 0, stripped: 0,
  };
  srand(seed);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const broad = fbm(x / 46, y / 46, seed, 4);
    const grain = fbm(x / 6.5, y / 6.5, seed + 900, 3);
    const cf = Math.abs(fbm(x / 30, y / 62, seed + 400, 3) - 0.5) * 2;
    const crack = 1 - Math.min(1, cf / 0.16);
    w.relief[i] = Math.min(1, Math.max(0, broad * 0.78 + grain * 0.22)) * (1 - 0.55 * crack) + 0.55 * crack * 0.12;
    w.shade[i] = broad * 0.62 + grain * 0.38 - crack * 0.30;
    w.veinF[i] = 1 - Math.abs(fbm(x / 26, y / 54, seed + 1300, 3) - 0.5) * 2;
    w.speckF[i] = fbm(x / 11, y / 11, seed + 2100, 3);
  }
  computeSterile(w, cfg.bareRock, cfg.veinStyle);
  computeWet(w, cfg.exposure, cfg.relief);
  prime(w);
  return w;
}

export function computeWet(w, exposure, relief) {
  const reach = w.H * (0.10 + exposure * 0.52);
  for (let y = 0; y < w.H; y++) {
    const above = w.waterRow - y;
    const w0 = above <= 0 ? 1 : Math.exp(-above / reach);
    for (let x = 0; x < w.W; x++) {
      const i = y * w.W + x;
      const hold = (1 - w.relief[i] - 0.5) * relief * 0.40;
      w.wet[i] = Math.min(1, Math.max(0, w0 + hold));
    }
  }
}

export function computeSterile(w, amountPct, stylePct) {
  const st = stylePct / 100, target = amountPct / 100;
  if (target <= 0) { w.sterile.fill(0); return; }
  const BINS = 256, hist = new Int32Array(BINS), f = new Float32Array(w.N);
  for (let i = 0; i < w.N; i++) {
    const v = w.veinF[i] * (1 - st) + w.speckF[i] * st;
    f[i] = v; hist[Math.min(BINS - 1, (v * BINS) | 0)]++;
  }
  const want = Math.round(target * w.N);
  let acc = 0, cut = 0;
  for (let b = BINS - 1; b >= 0; b--) { acc += hist[b]; if (acc >= want) { cut = b; break; } }
  const thr = cut / BINS;
  let marked = 0;
  for (let i = 0; i < w.N; i++) {
    const hit = f[i] >= thr && marked < want;
    w.sterile[i] = hit ? 1 : 0;
    if (hit) marked++;
  }
}

function lottery(w, i, accept) {
  let best = -1, bestScore = 0;
  for (let s = 0; s < NS; s++) {
    const sc = habitability(s, w.wet[i]) * (0.45 + rnd());
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  return bestScore > accept ? best : -1;
}

export function prime(w) {
  // PER AREA, like founding — see the probe's note. Fixing only the per-step term
  // leaves up to 39 points of grid-size drift at year 20.
  const tries = Math.round(900 * w.N / 40000);
  for (let t = 0; t < tries; t++) {
    const i = (rnd() * w.N) | 0;
    if (w.occ[i] !== -1 || w.sterile[i]) continue;
    const sp = lottery(w, i, 0.62);
    if (sp >= 0) { w.occ[i] = sp; w.age[i] = 0.4; }
  }
}

function makeMask(w, kind, sev) {
  const { W, H } = w;
  const cx = W * (0.2 + rnd() * 0.6), cy = H * (0.25 + rnd() * 0.5);
  const salt = w.seed + 1 + ((rnd() * 1e6) | 0);
  const wob = (x, y, s) => (fbm(x / 9, y / 9, s + salt, 2) - 0.5) * 2;
  let hit;
  switch (kind) {
    case 'band': { const half = 2 + sev * H * 0.52;
      hit = (x, y) => Math.abs(y - (w.waterRow - half * 0.35)) < half + wob(x, y, 11) * 6; break; }
    case 'plume': { const gx = rnd() * W, reach = H * (0.2 + sev * 0.8);
      hit = (x, y) => { const up = w.waterRow - y; if (up < 0 || up > reach) return false;
        const hw = (1 - up / reach) * (4 + sev * W * 0.16) + 2; return Math.abs(x - gx + wob(x, y, 23) * 7) < hw; }; break; }
    case 'spatter': { const n = 3 + Math.round(sev * 34), bl = [];
      for (let i = 0; i < n; i++) bl.push([rnd() * W, rnd() * H, 3 + rnd() * (4 + sev * 26)]);
      hit = (x, y) => bl.some(([bx, by, r]) => { const dx = x - bx, dy = y - by;
        return dx * dx + dy * dy < r * r * (0.7 + 0.6 * fbm(x / 8, y / 8, salt + 31, 2)); }); break; }
    case 'slab': { const a = rnd() * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      const hw = 6 + sev * W * 0.34, hh = 6 + sev * H * 0.34, sd = salt + 500;
      hit = (x, y) => { const dx = x - cx, dy = y - cy, u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        const ju = (fbm(v / 13, u / 55, sd, 3) - 0.5) * hw * 0.55 + (fbm(v / 4, u / 9, sd + 7, 2) - 0.5) * 7;
        const jv = (fbm(u / 13, v / 55, sd + 90, 3) - 0.5) * hh * 0.55 + (fbm(u / 4, v / 9, sd + 97, 2) - 0.5) * 7;
        return Math.abs(u) < hw + ju && Math.abs(v) < hh + jv; }; break; }
    case 'swath': { const a = (rnd() - 0.5) * 1.5, ca = Math.cos(a), sa = Math.sin(a), half = 4 + sev * H * 0.42;
      hit = (x, y) => Math.abs((x - cx) * sa + (y - cy) * ca + wob(x, y, 47) * 8) < half; break; }
    case 'checker': { const s = Math.max(5, H / (4 + Math.round(rnd() * 7)));
      const rw = W * (0.3 + sev * 0.7), rh = H * (0.3 + sev * 0.7);
      hit = (x, y) => Math.abs(x - cx) < rw / 2 && Math.abs(y - cy) < rh / 2 && ((Math.floor(x / s) + Math.floor(y / s)) % 2 === 0); break; }
    case 'smiley': { const r = (0.20 + sev * 0.55) * Math.min(W, H) * 0.7, t = Math.max(2.2, r * 0.10);
      const ex = r * 0.38, ey = -r * 0.30, er = r * 0.13;
      hit = (x, y) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy); if (d > r * 1.25) return false;
        if (Math.abs(d - r) < t) return true;
        if (Math.hypot(dx - ex, dy - ey) < er) return true; if (Math.hypot(dx + ex, dy - ey) < er) return true;
        const md = Math.hypot(dx, dy - r * 0.05); return Math.abs(md - r * 0.62) < t && dy > r * 0.16; }; break; }
    case 'spiral': { const turns = 2 + rnd() * 2.5, rMax = (0.25 + sev * 0.55) * Math.min(W, H) * 0.8, t = Math.max(2.2, rMax * 0.075);
      hit = (x, y) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy); if (d > rMax || d < 1) return false;
        const ang = Math.atan2(dy, dx), arm = (d / rMax) * turns * Math.PI * 2;
        let df = ((arm - ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); if (df > Math.PI) df -= Math.PI * 2;
        return Math.abs(df) * d / turns < t; }; break; }
    case 'dots': { const s = Math.max(8, H / (3 + Math.round(rnd() * 5))), r = s * (0.16 + sev * 0.26);
      hit = (x, y) => { const mx = ((x % s) + s) % s - s / 2, my = ((y % s) + s) % s - s / 2; return mx * mx + my * my < r * r; }; break; }
    case 'bite': { const r = (0.18 + sev * 0.5) * Math.min(W, H); hit = (x, y) => Math.hypot(x - cx, y - cy) < r; break; }
    default: hit = () => false;
  }
  return { hit, cx, cy, salt };
}

export function beginStorm(w, kind, sev) {
  const { hit, cx, cy, salt } = makeMask(w, kind, sev);
  const idx = [], key = [], maxR = Math.hypot(w.W, w.H) * 0.5;
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
    if (!hit(x, y)) continue;
    const i = y * w.W + x, dx = x - cx, dy = y - cy;
    const th = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5, r = Math.hypot(dx, dy) / maxR;
    const turb = (fbm(x / 13, y / 13, salt + 707, 2) - 0.5) * 0.22;
    let ph = (th * TURNS + r * COIL * TURNS + turb) % 1; if (ph < 0) ph += 1;
    idx.push(i); key.push(ph);
  }
  const order = idx.map((_, k) => k).sort((a, b) => key[a] - key[b]);
  w.storm = {
    kind, sev, salt, cells: Int32Array.from(order, k => idx[k]),
    phase: Float32Array.from(order, k => key[k]),
    ptr: 0, age: 0, dur: 1.4 + sev * 4.2, stripped: 0, at: w.simYears,
  };
  w.storms++;
  return w.storm;
}

export function stepStorm(w, dYears) {
  const s = w.storm;
  if (!s) return false;
  s.age += dYears;
  const prog = Math.min(1, s.age / s.dur);
  while (s.ptr < s.cells.length && s.phase[s.ptr] <= prog) {
    const i = s.cells[s.ptr++];
    w.scour[i] = 1;
    if (w.occ[i] !== -1 && hash2(i, 91, s.salt) >= SURVIVE) { w.occ[i] = -1; w.age[i] = 0; s.stripped++; }
  }
  if (prog >= 1) { w.stripped += s.stripped; w.lastStorm = s; w.storm = null; return false; }
  return true;
}

export function stepWorld(w, dYears) {
  const { N, W, H, cfg } = w;
  const k = Math.min(0.9, dYears * 2.1);

  const growTries = Math.floor(N * 0.42);
  for (let t = 0; t < growTries; t++) {
    const i = (rnd() * N) | 0;
    if (w.occ[i] !== -1 || w.sterile[i]) continue;
    const x = i % W, y = (i / W) | 0;
    const dir = (rnd() * 4) | 0;
    const nx = x + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
    const ny = y + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const j = ny * W + nx, sp = w.occ[j];
    if (sp === -1 || w.age[j] < 0.12) continue;
    const h = habitability(sp, w.wet[i]);
    if (h <= 0) continue;
    const lobe = 0.62 + 0.38 * fbm(x / 7, y / 7, w.seed + 77, 2);
    if (rnd() < k * SPECIES[sp].rate * h * lobe * 1.35) { w.occ[i] = sp; w.age[i] = 0; }
  }

  const dieTries = Math.floor(N * 0.30);
  for (let t = 0; t < dieTries; t++) {
    const i = (rnd() * N) | 0;
    if (w.occ[i] === -1) continue;
    const stress = 1 - habitability(w.occ[i], w.wet[i]);
    if (stress > 0.46 && rnd() < k * stress * stress * 0.30) { w.occ[i] = -1; w.age[i] = 0; }
  }

  // Founding is PER AREA (per 1000 cells per year), so the founder:growth balance
  // does not move with grid size. K is calibrated so 250x160 matches the probe.
  const lands = cfg.sporeRate * dYears * (N / 1000) * 0.10;
  const whole = Math.floor(lands) + (rnd() < (lands % 1) ? 1 : 0);
  for (let t = 0; t < whole; t++) {
    const i = (rnd() * N) | 0;
    if (w.occ[i] !== -1 || w.sterile[i]) continue;
    const sp = lottery(w, i, 0.42);
    if (sp >= 0) { w.occ[i] = sp; w.age[i] = 0; }
  }

  const dry = Math.max(0, 1 - dYears * 0.5);
  for (let i = 0; i < N; i++) {
    if (w.occ[i] !== -1) w.age[i] += dYears;
    if (w.scour[i] > 0) w.scour[i] *= dry;
  }
  w.simYears += dYears;

  if (w.storm) stepStorm(w, dYears);
  else if (w.simYears >= w.nextStorm) {
    const sev = 0.04 + Math.pow(rnd(), 2.4) * 0.92;
    const pool = (rnd() * 100 < cfg.whimsy) ? WHIMSY : NATURAL;
    beginStorm(w, pool[(rnd() * pool.length) | 0], sev);
    w.nextStorm = w.simYears + cfg.stormEvery * (0.45 + rnd() * 1.4);
  }
}

export function stats(w) {
  let cov = 0, ster = 0;
  const per = new Array(NS).fill(0);
  for (let i = 0; i < w.N; i++) {
    if (w.sterile[i]) ster++;
    if (w.occ[i] !== -1) { cov++; per[w.occ[i]]++; }
  }
  const colonisable = w.N - ster;
  return { cov, ster, colonisable, per, pct: cov / colonisable * 100 };
}

export const DEFAULTS = {
  exposure: 0.55, relief: 0.5, bareRock: 12, veinStyle: 35,
  sporeRate: 1, stormEvery: 18, whimsy: 15,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const seed = Number(process.argv[2] || 1);
  const w = makeWorld(250, 160, seed, { ...DEFAULTS });
  const dY = 40 / 60 / 60;
  const marks = [5, 10, 20, 40, 60, 90, 120, 180, 240, 300, 400, 500, 650, 800];
  let mi = 0, minP = 200, maxP = -1;
  console.log('years  cover%(colonisable)  storms  ' + SPECIES.map(s => s.short.padStart(7)).join(''));
  for (let f = 0; f < 80000 && mi < marks.length; f++) {
    stepWorld(w, dY);
    if (w.simYears > 25) { const p = stats(w).pct; if (p < minP) minP = p; if (p > maxP) maxP = p; }
    if (w.simYears >= marks[mi]) {
      const s = stats(w);
      console.log(String(marks[mi]).padStart(5), s.pct.toFixed(1).padStart(18),
        String(w.storms).padStart(7), '  ' + s.per.map(v => (v / w.N * 100).toFixed(1).padStart(7)).join(''));
      mi++;
    }
  }
  console.log(`\nseed ${seed}: min ${minP.toFixed(1)}%  max ${maxP.toFixed(1)}%  storms ${w.storms}  sterile ${(stats(w).ster / w.N * 100).toFixed(1)}%`);
}
