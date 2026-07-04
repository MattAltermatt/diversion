import { mulberry32 } from '../../framework/rng'
import type { ChladniConfig } from './schema'

const PI = Math.PI

// --- Tunables 🎚️ (unreleased — free to retune) --------------------------------
// Per-frame grain step in unit-square units, before the migrationSpeed/jitter
// sliders and dt scaling. FRAME_MS normalizes dt so behavior is fps-independent.
const FRAME_MS = 1000 / 60
const MIG_K = 0.02 // migration coefficient (× migrationSpeed × ampNorm)
const JIT_K = 0.008 // jitter coefficient (× jitter × bounce)
const JIT_FLOOR = 0.12 // min jitter fraction on the nodes (keeps grains from freezing off-line)
const AMP_MAX = 2 // |w| ceiling (two sine terms, each in [-1,1]) → normalize to 0..1

// Curated mode pairs for auto-cycle. All have n ≠ m so the "−" superposition
// never collapses the whole field to zero (n = m, sign −1 ⇒ w ≡ 0).
const MODE_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 2], [2, 3], [1, 3], [2, 4], [3, 4], [1, 4], [3, 5], [2, 5],
  [4, 5], [3, 6], [4, 6], [5, 6], [2, 7], [4, 7], [5, 7], [1, 5],
]

/** Standing-wave displacement of a square plate at unit-square (x, y) ∈ [0,1]²:
 *  w = sin(nπx)·sin(mπy) + s·sin(mπx)·sin(nπy), s = ±1 (superposition sign).
 *  It is exactly zero on the nodal lines the Chladni figure traces (and on the
 *  four plate edges, where every sin term vanishes). */
export function chladniField(x: number, y: number, n: number, m: number, sign: number): number {
  const a = Math.sin(n * PI * x) * Math.sin(m * PI * y)
  const b = Math.sin(m * PI * x) * Math.sin(n * PI * y)
  return a + sign * b
}

/** Analytic gradient (∂w/∂x, ∂w/∂y) — a sum of sines/cosines, cheap to evaluate.
 *  Grains step down the |w| gradient toward the nodal lines. */
export function chladniGrad(
  x: number, y: number, n: number, m: number, sign: number,
): [number, number] {
  const gx = n * PI * Math.cos(n * PI * x) * Math.sin(m * PI * y)
    + sign * m * PI * Math.cos(m * PI * x) * Math.sin(n * PI * y)
  const gy = m * PI * Math.sin(n * PI * x) * Math.cos(m * PI * y)
    + sign * n * PI * Math.sin(m * PI * x) * Math.cos(n * PI * y)
  return [gx, gy]
}

/** Seeded shuffle of the curated mode pairs — the auto-cycle order is fixed by
 *  the seed (so the same seed replays the same sequence of figures). */
export function buildModeOrder(seed: number): Array<[number, number]> {
  const rng = mulberry32((seed ^ 0x1234567) >>> 0)
  const arr = MODE_PAIRS.map((p) => [p[0], p[1]] as [number, number])
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t
  }
  return arr
}

export interface ChladniState {
  cfg: ChladniConfig
  xs: Float32Array // grain positions in unit-square coords [0,1]
  ys: Float32Array
  rng: () => number // seeded — keeps per-frame jitter deterministic per seed
  n: number // active mode
  m: number
  modeOrder: Array<[number, number]>
  modeIdx: number
  modeClock: number // ms accumulated in the current figure
  w: number
  h: number
}

export function createChladniState(cfg: ChladniConfig, w: number, h: number): ChladniState {
  // avoid the mulberry32(0) degenerate stream if seed happens to be 0
  const rng = mulberry32((cfg.seed >>> 0) || 0x9e3779b9)
  const N = cfg.grainCount
  const xs = new Float32Array(N)
  const ys = new Float32Array(N)
  for (let i = 0; i < N; i++) { xs[i] = rng(); ys[i] = rng() }
  const modeOrder = buildModeOrder(cfg.seed)
  const [n, m] = cfg.autoCycle === 'cycle' ? modeOrder[0] : [cfg.modeN, cfg.modeM]
  return { cfg, xs, ys, rng, n, m, modeOrder, modeIdx: 0, modeClock: 0, w, h }
}

/** Advance the simulation one frame (dt in ms). Pure over state + dt; mutates the
 *  grain arrays in place. Each grain: step down the |w| gradient toward the nodes,
 *  then a vibration jitter that is strongest on the antinodes (|w| large) and near
 *  a small floor on the nodes — so grains escape antinodes yet still settle. */
export function stepGrains(state: ChladniState, dt: number): void {
  const { cfg } = state

  // Advance the auto-cycle. A mode change doesn't move grains — the field they sit
  // in simply changes, so the old figure dissolves and grains re-migrate.
  if (cfg.autoCycle === 'cycle') {
    state.modeClock += dt
    if (state.modeClock >= cfg.dwell * 1000) {
      state.modeClock = 0
      state.modeIdx = (state.modeIdx + 1) % state.modeOrder.length
      const next = state.modeOrder[state.modeIdx]
      state.n = next[0]; state.m = next[1]
    }
  } else {
    state.n = cfg.modeN; state.m = cfg.modeM
  }

  const sign = cfg.superposition === '-' ? -1 : 1
  const dts = dt / FRAME_MS
  const { xs, ys, rng } = state
  const n = state.n, m = state.m
  const migStep = cfg.migrationSpeed * MIG_K * dts
  const jitStep = cfg.jitter * JIT_K * dts

  for (let i = 0; i < xs.length; i++) {
    let x = xs[i], y = ys[i]
    const w = chladniField(x, y, n, m, sign)
    const absW = w < 0 ? -w : w
    const ampN = absW > AMP_MAX ? 1 : absW / AMP_MAX // 0 on nodes → 1 on antinodes

    // Migrate down the |w| gradient (∇|w| = sign(w)·∇w). Step slows as ampN → 0,
    // so grains settle smoothly onto the line instead of oscillating across it.
    const [gx, gy] = chladniGrad(x, y, n, m, sign)
    const gmag = Math.hypot(gx, gy)
    if (gmag > 1e-6) {
      const s = w >= 0 ? 1 : -1
      const step = migStep * ampN
      x -= (s * gx / gmag) * step
      y -= (s * gy / gmag) * step
    }

    // Vibration bounce: hardest on antinodes (ampN≈1), a small floor on nodes.
    const j = jitStep * (JIT_FLOOR + (1 - JIT_FLOOR) * ampN)
    x += (rng() * 2 - 1) * j
    y += (rng() * 2 - 1) * j

    // Reflect back into the plate, then clamp for safety (grains stay in-bounds).
    if (x < 0) x = -x; else if (x > 1) x = 2 - x
    if (y < 0) y = -y; else if (y > 1) y = 2 - y
    x = x < 0 ? 0 : x > 1 ? 1 : x
    y = y < 0 ? 0 : y > 1 ? 1 : y

    xs[i] = x; ys[i] = y
  }
}

/** Apply a config change to a live state in place. Structural changes (grain count
 *  or seed) need a fresh scatter → return false; everything else is read live. */
export function updateChladniState(state: ChladniState, cfg: ChladniConfig): boolean {
  if (cfg.grainCount !== state.cfg.grainCount || cfg.seed !== state.cfg.seed) return false
  state.cfg = cfg
  return true
}

/** Mean vibration amplitude |w| over all grains for the active mode — the settling
 *  metric: it starts moderate and falls toward ~0 as grains find the nodal lines. */
export function meanAmplitude(state: ChladniState): number {
  const sign = state.cfg.superposition === '-' ? -1 : 1
  const { xs, ys, n, m } = state
  let sum = 0
  for (let i = 0; i < xs.length; i++) {
    sum += Math.abs(chladniField(xs[i], ys[i], n, m, sign))
  }
  return sum / xs.length
}
