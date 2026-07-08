import { mulberry32 } from '../../framework/rng'
import type { SlimeAggregationConfig } from './schema'

// Slime Aggregation's excitable cAMP field — a 3-state Greenberg-Hastings-style
// automaton (REST → WAVE → RECOVER), the same universality class as
// excitable-media's hodgepodge machine and contagion's SIRS lattice, adapted for
// a CPU 2D grid: a resting cell catches the pulse from an excited (WAVE) neighbour
// with probability `excitability`, stays at the bright crest for `waveWidth`
// steps, then is refractory (immune, fading) for `recoveryTime` steps before it
// can catch again. A handful of PACEMAKER cells self-fire on a steady rhythm,
// independent of their neighbours — the aggregation centers every relay wave
// radiates from, and (via the agent layer in agents.ts) the streams converge on.

export const REST = 0
export const WAVE = 1
export const RECOVER = 2

export interface Pacemaker {
  nx: number // normalized [0,1) position — survives resize without remapping
  ny: number
  period: number // steps between self-fires
  countdown: number // steps remaining until this pacemaker next fires
}

export interface Field {
  gw: number
  gh: number
  state: Uint8Array
  stateB: Uint8Array
  timer: Uint16Array // steps remaining in the current WAVE or RECOVER phase
  timerB: Uint16Array
  pacemakers: Pacemaker[]
  rng: () => number
}

export function fieldDims(w: number, h: number, cellSize: number): { gw: number; gh: number } {
  return { gw: Math.max(8, Math.ceil(w / cellSize)), gh: Math.max(8, Math.ceil(h / cellSize)) }
}

/** A pacemaker's period, in field steps, at a given wave/recovery pace — spaced
 *  a little past a full wave cycle so its own crest has room to clear before it
 *  fires again, with per-pacemaker jitter so they don't all pulse in lockstep. */
function pacemakerPeriod(rng: () => number, waveWidth: number, recoveryTime: number): number {
  const base = waveWidth + recoveryTime * 0.6
  return Math.round(base * (0.75 + rng() * 0.7))
}

/** Deterministic per-seed pacemaker placement, spread with a little rejection
 *  sampling so they don't cluster on top of one another. */
export function seedPacemakers(cfg: SlimeAggregationConfig, seed: number): Pacemaker[] {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const placed: Pacemaker[] = []
  for (let i = 0; i < cfg.pacemakerCount; i++) {
    let best = { nx: 0.5, ny: 0.5 }
    let bestD = -1
    for (let tries = 0; tries < 24; tries++) {
      const nx = 0.15 + rng() * 0.7
      const ny = 0.15 + rng() * 0.7
      let d = Infinity
      for (const p of placed) {
        const dx = nx - p.nx, dy = ny - p.ny
        const dist = dx * dx + dy * dy
        if (dist < d) d = dist
      }
      if (d > bestD) { bestD = d; best = { nx, ny } }
      if (d >= 0.05) break // good enough separation
    }
    const period = pacemakerPeriod(rng, cfg.waveWidth, cfg.recoveryTime)
    placed.push({ nx: best.nx, ny: best.ny, period, countdown: Math.floor(rng() * period) })
  }
  return placed
}

export function createField(cfg: SlimeAggregationConfig, gw: number, gh: number, seed: number): Field {
  const n = gw * gh
  return {
    gw, gh,
    state: new Uint8Array(n), stateB: new Uint8Array(n),
    timer: new Uint16Array(n), timerB: new Uint16Array(n),
    pacemakers: seedPacemakers(cfg, seed),
    rng: mulberry32((seed ^ 0x2545f491) >>> 0),
  }
}

// Tiny background reintroduction — the same trick contagion's sparkRate uses:
// a vanishingly rare spontaneous ignition on an otherwise-resting cell, just
// enough to seed the odd wave-break that curls a colliding wavefront into a
// spiral, without competing with the deliberate pacemakers as a wave source.
const SPONTANEOUS_RATE = 0.0000012

/** One synchronous field step (toroidal — a wave never terminates at an edge).
 *  Advances state/timer, then force-fires any pacemaker whose rhythm is due
 *  (only into a cell that's currently resting — a busy pacemaker just waits). */
export function stepField(field: Field, cfg: SlimeAggregationConfig): void {
  const { gw, gh, state, stateB, timer, timerB, rng } = field
  const beta = cfg.excitability
  const waveWidth = cfg.waveWidth
  const recoverTime = cfg.recoveryTime
  for (let y = 0; y < gh; y++) {
    const ym = ((y - 1 + gh) % gh) * gw
    const y0 = y * gw
    const yp = ((y + 1) % gh) * gw
    for (let x = 0; x < gw; x++) {
      const xm = (x - 1 + gw) % gw
      const xp = (x + 1) % gw
      const i = y0 + x
      const s = state[i]
      if (s === WAVE) {
        const t = timer[i] - 1
        if (t <= 0) { stateB[i] = RECOVER; timerB[i] = recoverTime }
        else { stateB[i] = WAVE; timerB[i] = t }
      } else if (s === RECOVER) {
        const t = timer[i] - 1
        if (t <= 0) { stateB[i] = REST; timerB[i] = 0 }
        else { stateB[i] = RECOVER; timerB[i] = t }
      } else {
        let nWave = 0
        if (state[ym + x] === WAVE) nWave++
        if (state[yp + x] === WAVE) nWave++
        if (state[y0 + xm] === WAVE) nWave++
        if (state[y0 + xp] === WAVE) nWave++
        if (state[ym + xm] === WAVE) nWave++
        if (state[ym + xp] === WAVE) nWave++
        if (state[yp + xm] === WAVE) nWave++
        if (state[yp + xp] === WAVE) nWave++
        let ignite = false
        if (nWave > 0) ignite = rng() >= Math.pow(1 - beta, nWave)
        if (!ignite && rng() < SPONTANEOUS_RATE) ignite = true
        if (ignite) { stateB[i] = WAVE; timerB[i] = waveWidth }
        else { stateB[i] = REST; timerB[i] = 0 }
      }
    }
  }
  field.state = stateB; field.stateB = state
  field.timer = timerB; field.timerB = timer

  for (const pm of field.pacemakers) {
    pm.countdown--
    if (pm.countdown > 0) continue
    pm.countdown = pm.period
    let xi = Math.floor(pm.nx * gw); if (xi >= gw) xi = gw - 1
    let yi = Math.floor(pm.ny * gh); if (yi >= gh) yi = gh - 1
    const idx = yi * gw + xi
    if (field.state[idx] === REST) { field.state[idx] = WAVE; field.timer[idx] = waveWidth }
  }
}

/** Map a cell's (state, timer) to an intensity in 0..1 for both the color ramp
 *  and the agents' chemotaxis gradient. Rest = 0; a fresh WAVE = 1 (the crest);
 *  RECOVER fades linearly back toward 0 as its refractory countdown runs out. */
export function fieldIntensity(state: number, timer: number, waveWidth: number, recoverTime: number): number {
  if (state === WAVE) return waveWidth <= 1 ? 1 : 0.7 + 0.3 * (timer / waveWidth)
  if (state === RECOVER) return recoverTime <= 0 ? 0 : 0.7 * (timer / recoverTime)
  return 0
}

/** Sample the field's intensity at a normalized [0,1) world position (nearest
 *  cell — the grid is fine enough that this reads smooth once upsampled). */
export function sampleIntensity(field: Field, cfg: SlimeAggregationConfig, nx: number, ny: number): number {
  const { gw, gh, state, timer } = field
  let xi = Math.floor(((nx % 1) + 1) % 1 * gw); if (xi >= gw) xi = gw - 1
  let yi = Math.floor(((ny % 1) + 1) % 1 * gh); if (yi >= gh) yi = gh - 1
  const idx = yi * gw + xi
  return fieldIntensity(state[idx], timer[idx], cfg.waveWidth, cfg.recoveryTime)
}
