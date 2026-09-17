// Seed sweep for LICHEN #358: min/max coverage over ~444 years, sampled EVERY
// simulated year (sparse year-marks miss the peaks and troughs and make the
// longrun gate look flaky when it is not). Run: node <this file> <seed>
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
const cfg = { stormEvery: 18, whimsy: 15, exposure: 0.55, seedRate: 1, relief: 0.5 };
const rockSeed = Number(process.argv[2] || 1);
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
// ---- storms (mirrors the probe) ----
const NATURAL = ['band','plume','spatter','slab','swath'];
const WHIMSY  = ['checker','smiley','spiral','dots','bite'];
let nextStorm = 6, stormCount = 0, strippedTotal = 0;
function makeMask(kind, sev) {
  const cx = W * (0.2 + rnd() * 0.6), cy = H * (0.25 + rnd() * 0.5);
  const wob = (x, y, s) => (fbm(x / 9, y / 9, s, 2) - 0.5) * 2;
  switch (kind) {
    case 'band': { const half = 2 + sev * H * 0.52;
      return (x,y) => Math.abs(y - (waterRow - half * 0.35)) < half + wob(x,y,11) * 6; }
    case 'plume': { const gx = rnd()*W, reach = H*(0.2+sev*0.8);
      return (x,y) => { const up = waterRow - y; if (up<0||up>reach) return false;
        const hw = (1-up/reach)*(4+sev*W*0.16)+2; return Math.abs(x-gx+wob(x,y,23)*7) < hw; }; }
    case 'spatter': { const n = 3+Math.round(sev*34), bl=[];
      for (let i=0;i<n;i++) bl.push([rnd()*W, rnd()*H, 3+rnd()*(4+sev*26)]);
      return (x,y) => bl.some(([bx,by,r]) => { const dx=x-bx,dy=y-by;
        return dx*dx+dy*dy < r*r*(0.7+0.6*fbm(x/8,y/8,31,2)); }); }
    case 'slab': { const a=rnd()*Math.PI, ca=Math.cos(a), sa=Math.sin(a);
      const hw=6+sev*W*0.34, hh=6+sev*H*0.34, sd=500+((rnd()*900)|0);
      return (x,y) => { const dx=x-cx,dy=y-cy,u=dx*ca+dy*sa,v=-dx*sa+dy*ca;
        const ju=(fbm(v/13,u/55,sd,3)-0.5)*hw*0.55+(fbm(v/4,u/9,sd+7,2)-0.5)*7;
        const jv=(fbm(u/13,v/55,sd+90,3)-0.5)*hh*0.55+(fbm(u/4,v/9,sd+97,2)-0.5)*7;
        return Math.abs(u)<hw+ju && Math.abs(v)<hh+jv; }; }
    case 'swath': { const a=(rnd()-0.5)*1.5, ca=Math.cos(a), sa=Math.sin(a), half=4+sev*H*0.42;
      return (x,y) => Math.abs((x-cx)*sa+(y-cy)*ca+wob(x,y,47)*8) < half; }
    case 'checker': { const s=Math.max(5,H/(4+Math.round(rnd()*7)));
      const rw=W*(0.3+sev*0.7), rh=H*(0.3+sev*0.7);
      return (x,y) => Math.abs(x-cx)<rw/2 && Math.abs(y-cy)<rh/2 && ((Math.floor(x/s)+Math.floor(y/s))%2===0); }
    case 'smiley': { const r=(0.20+sev*0.55)*Math.min(W,H)*0.7, t=Math.max(2.2,r*0.10);
      const ex=r*0.38, ey=-r*0.30, er=r*0.13;
      return (x,y) => { const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy); if (d>r*1.25) return false;
        if (Math.abs(d-r)<t) return true;
        if (Math.hypot(dx-ex,dy-ey)<er) return true; if (Math.hypot(dx+ex,dy-ey)<er) return true;
        const md=Math.hypot(dx,dy-r*0.05); return Math.abs(md-r*0.62)<t && dy>r*0.16; }; }
    case 'spiral': { const turns=2+rnd()*2.5, rMax=(0.25+sev*0.55)*Math.min(W,H)*0.8, t=Math.max(2.2,rMax*0.075);
      return (x,y) => { const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy); if (d>rMax||d<1) return false;
        const ang=Math.atan2(dy,dx), arm=(d/rMax)*turns*Math.PI*2;
        let df=((arm-ang)%(Math.PI*2)+Math.PI*2)%(Math.PI*2); if (df>Math.PI) df-=Math.PI*2;
        return Math.abs(df)*d/turns < t; }; }
    case 'dots': { const s=Math.max(8,H/(3+Math.round(rnd()*5))), r=s*(0.16+sev*0.26);
      return (x,y) => { const mx=((x%s)+s)%s-s/2, my=((y%s)+s)%s-s/2; return mx*mx+my*my<r*r; }; }
    case 'bite': { const r=(0.18+sev*0.5)*Math.min(W,H); return (x,y) => Math.hypot(x-cx,y-cy)<r; }
    default: return () => false;
  }
}
function fireStorm() {
  const sev = 0.04 + Math.pow(rnd(), 2.4) * 0.92;
  const pool = (rnd()*100 < cfg.whimsy) ? WHIMSY : NATURAL;
  const kind = pool[(rnd()*pool.length)|0];
  const hit = makeMask(kind, sev);
  let stripped = 0;
  for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
    if (!hit(x,y)) continue; const i=y*W+x;
    if (occ[i]!==-1) { occ[i]=-1; age[i]=0; stripped++; }
  }
  stormCount++; strippedTotal += stripped;
  return stripped / N * 100;
}

function updateWet() {
  waterRow = H * 0.88;
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
  if (simYears >= nextStorm) { fireStorm(); nextStorm = simYears + cfg.stormEvery * (0.45 + rnd() * 1.4); }
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
const dY = 40 / 60 / 60;
let minC = 2, maxC = -1, firstAbove90 = null, firstBelow60 = null;
const samples = [];
for (let f = 0; f < 40000; f++) {   // ~400 years
  step(dY);
  if (f % 30 === 0) {               // sample every simulated year
    let cov = 0; for (let i = 0; i < N; i++) if (occ[i] !== -1) cov++;
    const c = cov / N;
    samples.push(c);
    if (simYears > 25) { if (c < minC) minC = c; if (c > maxC) maxC = c; }
    if (firstAbove90 === null && c > 0.90) firstAbove90 = simYears;
    if (firstBelow60 === null && simYears > 25 && c < 0.60) firstBelow60 = simYears;
  }
}
console.log(JSON.stringify({
  seed: rockSeed,
  min: +(minC * 100).toFixed(1), max: +(maxC * 100).toFixed(1),
  above90At: firstAbove90 === null ? null : +firstAbove90.toFixed(0),
  below60At: firstBelow60 === null ? null : +firstBelow60.toFixed(0),
  storms: stormCount,
}));
