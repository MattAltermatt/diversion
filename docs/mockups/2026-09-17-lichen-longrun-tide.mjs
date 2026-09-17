// Headless long-run harness for LICHEN #358 — TIDE version (the REJECTED design).
// Kept as the evidence that a moving water line does NOT re-open the community:
// coverage pins at ~100% from year 60 and species shares freeze. Run: node <this file>
let rngState = 1;
const srand = s => { rngState = (s >>> 0) || 1; };
const rnd = () => {
  rngState ^= rngState << 13; rngState >>>= 0;
  rngState ^= rngState >> 17;
  rngState ^= rngState << 5;  rngState >>>= 0;
  return rngState / 4294967296;
};
const hash2 = (x, y, s) => {
  let h = x * 374761393 + y * 668265263 + s * 1442695040;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
};
const smooth = t => t * t * (3 - 2 * t);
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi, u = smooth(xf), v = smooth(yf);
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
  { short:'Verrucaria', band:[0.72,1.00], rate:1.00 },
  { short:'Caloplaca',  band:[0.46,0.80], rate:0.86 },
  { short:'Xanthoria',  band:[0.33,0.62], rate:0.74 },
  { short:'Lecanora',   band:[0.16,0.44], rate:0.60 },
  { short:'Ramalina',   band:[0.02,0.28], rate:0.52 },
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

const W = 250, H = 160, N = W * H;
const cfg = { tide: 0.5, exposure: 0.55, seedRate: 1, relief: 0.5 };
const rockSeed = 1;
srand(rockSeed);
const relief = new Float32Array(N), occ = new Int8Array(N).fill(-1);
const age = new Float32Array(N), wet = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  const broad = fbm(x / 46, y / 46, rockSeed, 4);
  const grain = fbm(x / 6.5, y / 6.5, rockSeed + 900, 3);
  const crackField = Math.abs(fbm(x / 30, y / 62, rockSeed + 400, 3) - 0.5) * 2;
  const crack = 1 - Math.min(1, crackField / 0.16);
  relief[i] = Math.min(1, Math.max(0, broad * 0.78 + grain * 0.22)) * (1 - 0.55 * crack) + 0.55 * crack * 0.12;
}
let simYears = 0, waterRow = 0, deaths = 0, births = 0;
function updateWet() {
  const slow = Math.sin(simYears * 0.26) * 0.64 + Math.sin(simYears * 0.097 + 1.7) * 0.36;
  waterRow = H * 0.88 + slow * cfg.tide * H * 0.20;
  const reach = H * (0.10 + cfg.exposure * 0.52);
  for (let y = 0; y < H; y++) {
    const above = waterRow - y;
    const w0 = above <= 0 ? 1 : Math.exp(-above / reach);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const hold = (1 - relief[i] - 0.5) * cfg.relief * 0.40;
      wet[i] = Math.min(1, Math.max(0, w0 + hold));
    }
  }
}
function step(dY) {
  updateWet();
  const k = Math.min(0.9, dY * 2.1);
  const growTries = Math.floor(N * 0.42);
  for (let t = 0; t < growTries; t++) {
    const i = (rnd() * N) | 0;
    if (occ[i] !== -1) continue;
    const x = i % W, y = (i / W) | 0;
    const dir = (rnd() * 4) | 0;
    const nx = x + (dir === 0 ? 1 : dir === 1 ? -1 : 0);
    const ny = y + (dir === 2 ? 1 : dir === 3 ? -1 : 0);
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const j = ny * W + nx, sp = occ[j];
    if (sp === -1 || age[j] < 0.12) continue;
    const h = habitability(sp, wet[i]);
    if (h <= 0) continue;
    const lobe = 0.62 + 0.38 * fbm(x / 7, y / 7, rockSeed + 77, 2);
    if (rnd() < k * SPECIES[sp].rate * h * lobe * 1.35) { occ[i] = sp; age[i] = 0; births++; }
  }
  const dieTries = Math.floor(N * 0.30);
  for (let t = 0; t < dieTries; t++) {
    const i = (rnd() * N) | 0;
    const sp = occ[i];
    if (sp === -1) continue;
    const stress = 1 - habitability(sp, wet[i]);
    if (stress > 0.46 && rnd() < k * stress * stress * 0.30) { occ[i] = -1; age[i] = 0; deaths++; }
  }
  const lands = cfg.seedRate * dY * 4;
  const whole = Math.floor(lands) + (rnd() < (lands % 1) ? 1 : 0);
  for (let t = 0; t < whole; t++) {
    const i = (rnd() * N) | 0;
    if (occ[i] !== -1) continue;
    const w = wet[i];
    let best = -1, bestScore = 0;
    for (let s = 0; s < NS; s++) {
      const sc = habitability(s, w) * (0.45 + rnd());
      if (sc > bestScore) { bestScore = sc; best = s; }
    }
    if (best >= 0 && bestScore > 0.42) { occ[i] = best; age[i] = 0; }
  }
  for (let i = 0; i < N; i++) if (occ[i] !== -1) age[i] += dY;
  simYears += dY;
}
// prime
updateWet();
for (let t = 0; t < 900; t++) {
  const i = (rnd() * N) | 0;
  if (occ[i] !== -1) continue;
  const w = wet[i];
  let best = -1, bestScore = 0;
  for (let s = 0; s < NS; s++) {
    const sc = habitability(s, w) * (0.45 + rnd());
    if (sc > bestScore) { bestScore = sc; best = s; }
  }
  if (best >= 0 && bestScore > 0.62) { occ[i] = best; age[i] = 0.4; }
}
const dY = 40 / 60 / 60;           // 40 years per minute at 60fps
const marks = new Set([5,10,20,40,60,90,120,180,240,300,400,500,650,800]);
console.log('years  cover%  bare%  ' + SPECIES.map(s => s.short.slice(0,5).padStart(6)).join('') + '   births/yr  deaths/yr');
let lastB = 0, lastD = 0, lastY = 0;
for (let f = 0; f < 80000; f++) {
  step(dY);
  const yr = Math.round(simYears);
  if (marks.has(yr) && Math.abs(simYears - yr) < dY / 2) {
    let cov = 0; const c = new Array(NS).fill(0);
    for (let i = 0; i < N; i++) if (occ[i] !== -1) { cov++; c[occ[i]]++; }
    const dy = simYears - lastY;
    console.log(
      String(yr).padStart(5),
      (cov / N * 100).toFixed(1).padStart(6),
      ((1 - cov / N) * 100).toFixed(1).padStart(6),
      c.map(v => (v / N * 100).toFixed(1).padStart(6)).join(''),
      ((births - lastB) / dy).toFixed(0).padStart(10),
      ((deaths - lastD) / dy).toFixed(0).padStart(10));
    lastB = births; lastD = deaths; lastY = simYears;
    marks.delete(yr);
    if (!marks.size) break;
  }
}
