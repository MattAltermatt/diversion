// firefly.ts — framework-agnostic pulse-coupled oscillator simulation.
//
// Each firefly is an integrate-and-fire oscillator (Mirollo–Strogatz): its phase
// rises linearly from 0 toward 1 at its own natural frequency; on reaching 1 it
// FLASHES and resets to 0, and nudges every neighbour within reach UP by ε. A
// nudge can push a neighbour over 1, making it flash too — a cascade that, from
// random phases, self-organizes the swarm into travelling waves and unison.
//
// Positions live in a normalized [0,1]² square (viewport-independent, so a resize
// never regenerates the field — index.ts just maps them to the live canvas). All
// randomness is seeded (mulberry32) so the same seed reproduces the same dance.

import { mulberry32 } from '../../framework/rng'
import type { FireflyConfig } from './schema'

export interface FireflyState {
  cfg: FireflyConfig
  w: number
  h: number
  n: number
  // Per-firefly state (structure-of-arrays).
  nx: Float32Array // base position, 0..1
  ny: Float32Array
  vx: Float32Array // drift velocity, normalized units / sec
  vy: Float32Array
  freq: Float32Array // natural frequency, flashes / sec
  phase: Float32Array // 0..1
  glow: Float32Array // 0..1 flash brightness (spikes to 1, decays = afterglow)
  noiseRng: () => number // runtime jitter stream (seeded, deterministic)
  // Scratch reused across frames (no per-frame allocation).
  fired: Uint8Array
  queue: Int32Array
  head: Int32Array // spatial-grid cell heads
  next: Int32Array
  cols: number
  rows: number
}

/** Build the initial swarm from a seed. Deterministic for a given (config, seed). */
export function createFireflyState(cfg: FireflyConfig, w: number, h: number): FireflyState {
  const n = cfg.fireflyCount
  const rng = mulberry32(cfg.seed >>> 0)

  const nx = new Float32Array(n)
  const ny = new Float32Array(n)
  const vx = new Float32Array(n)
  const vy = new Float32Array(n)
  const freq = new Float32Array(n)
  const phase = new Float32Array(n)
  const glow = new Float32Array(n)

  const driftMag = 0.012 // normalized units / sec — a very slow wander
  for (let i = 0; i < n; i++) {
    nx[i] = rng()
    ny[i] = rng()
    phase[i] = rng() // random initial phases → the swarm starts out of sync
    // Heterogeneous natural frequency: base tempo ± spread. Keeps a synced swarm
    // breathing instead of locking dead-still.
    const f = cfg.flashRate * (1 + cfg.frequencySpread * (rng() * 2 - 1))
    freq[i] = Math.max(0.02, f)
    const ang = rng() * Math.PI * 2
    vx[i] = Math.cos(ang) * driftMag
    vy[i] = Math.sin(ang) * driftMag
    glow[i] = 0
  }

  return {
    cfg, w, h, n,
    nx, ny, vx, vy, freq, phase, glow,
    noiseRng: mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0),
    fired: new Uint8Array(n),
    queue: new Int32Array(n),
    head: new Int32Array(0),
    next: new Int32Array(n),
    cols: 0,
    rows: 0,
  }
}

/** Kuramoto/PCO synchrony order parameter R = |mean(e^{i·2π·phase})|.
 *  R ≈ 1/√n for random phases; R → 1 for a fully synchronized swarm. */
export function orderParameter(phase: Float32Array | number[], n = phase.length): number {
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    const a = phase[i] * Math.PI * 2
    sx += Math.cos(a)
    sy += Math.sin(a)
  }
  return Math.hypot(sx, sy) / n
}

// Ensure the uniform grid matches the current neighbour radius. Cells tile the
// unit square exactly (cellSize = 1/cols) so a cell walk covers the true reach.
function ensureGrid(state: FireflyState, radius: number): void {
  const cols = Math.max(1, Math.floor(1 / radius))
  if (cols !== state.cols) {
    state.cols = cols
    state.rows = cols
    state.head = new Int32Array(cols * cols)
  }
}

/** Advance the swarm by `dtSec` seconds. Deterministic given the state + dt. */
export function stepFireflies(state: FireflyState, dtSec: number): void {
  const { cfg, n, nx, ny, vx, vy, freq, phase, glow, fired, queue } = state
  // Clamp dt so a stalled/background tab can't teleport phases (throttled rAF).
  const dt = Math.min(Math.max(dtSec, 0), 0.05)
  const eps = cfg.coupling
  const radius = cfg.neighbourRadius
  const jitter = cfg.phaseNoise
  const drifting = cfg.motion === 'drift'

  fired.fill(0)
  let qn = 0

  // 1) Advance phase (+ drift, + jitter); collect naturally-firing fireflies.
  for (let i = 0; i < n; i++) {
    let p = phase[i] + freq[i] * dt
    if (jitter > 0) p += (state.noiseRng() * 2 - 1) * jitter * dt
    if (drifting) {
      let x = nx[i] + vx[i] * dt
      let y = ny[i] + vy[i] * dt
      // Wrap in the unit square so the meadow never empties.
      if (x < 0) x += 1; else if (x >= 1) x -= 1
      if (y < 0) y += 1; else if (y >= 1) y -= 1
      nx[i] = x
      ny[i] = y
    }
    if (p >= 1) {
      phase[i] = 0
      glow[i] = 1
      fired[i] = 1
      queue[qn++] = i
    } else {
      phase[i] = p
    }
  }

  // 2) Build the spatial grid over the (possibly drifted) positions.
  ensureGrid(state, radius)
  const { cols, head, next } = state
  head.fill(-1)
  for (let i = 0; i < n; i++) {
    let cx = (nx[i] * cols) | 0
    let cy = (ny[i] * cols) | 0
    if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1
    if (cy < 0) cy = 0; else if (cy >= cols) cy = cols - 1
    const c = cy * cols + cx
    next[i] = head[c]
    head[c] = i
  }

  // 3) Process flashes; each nudges neighbours within reach, cascading. `fired`
  //    guards one flash per firefly per step, so the queue is bounded by n.
  const r2 = radius * radius
  let qi = 0
  while (qi < qn) {
    const j = queue[qi++]
    const jx = nx[j]
    const jy = ny[j]
    let cx = (jx * cols) | 0
    let cy = (jy * cols) | 0
    if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1
    if (cy < 0) cy = 0; else if (cy >= cols) cy = cols - 1
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      if (gy < 0 || gy >= cols) continue
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gx >= cols) continue
        for (let k = head[gy * cols + gx]; k !== -1; k = next[k]) {
          if (fired[k]) continue
          const dx = nx[k] - jx
          const dy = ny[k] - jy
          if (dx * dx + dy * dy > r2) continue
          const p = phase[k] + eps
          if (p >= 1) {
            phase[k] = 0
            glow[k] = 1
            fired[k] = 1
            queue[qn++] = k
          } else {
            phase[k] = p
          }
        }
      }
    }
  }

  // 4) Decay the flash glow toward 0 — this IS the afterglow trail.
  const decay = Math.exp(-dt / cfg.afterglow)
  for (let i = 0; i < n; i++) glow[i] *= decay
}
