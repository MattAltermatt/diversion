import type { Size } from '../../framework/types'
import { createField, fieldDims, stepField, type Field } from './field'
import { createAgents, stepAgents, aggregationFraction, type AgentSwarm } from './agents'
import { buildLUT } from './render'
import type { SlimeAggregationConfig } from './schema'

export interface SlimeAggregationState {
  cfg: SlimeAggregationConfig
  w: number
  h: number
  field: Field
  agents: AgentSwarm
  trail: Float32Array // gw*gh — agent-deposit accumulation, the stream glow
  scratch: Float32Array // shared diffuse scratch buffer, reused across steps
  lut: Uint8Array
  stepAcc: number
  aggHoldMs: number // consecutive ms the aggregation fraction has held above threshold
  runStartT: number // sim-clock t at which this run started (-1 until first frame)
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
  dirty: boolean
}

// Fields that reshape the world (grid geometry, population, or the seeded
// pacemaker/agent layout) — everything else applies live via state.cfg swap.
export const STRUCTURAL: (keyof SlimeAggregationConfig)[] = ['cellSize', 'pacemakerCount', 'agentCount', 'seed']

function makeOffscreen(gw: number, gh: number): { off: HTMLCanvasElement; offCtx: CanvasRenderingContext2D } {
  const off = document.createElement('canvas')
  off.width = gw
  off.height = gh
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Slime Aggregation requires a 2D context for its offscreen field buffer')
  return { off, offCtx }
}

export function createSlimeState(cfg: SlimeAggregationConfig, w: number, h: number): SlimeAggregationState {
  const { gw, gh } = fieldDims(w, h, cfg.cellSize)
  const field = createField(cfg, gw, gh, cfg.seed)
  const agents = createAgents(cfg.seed, cfg.agentCount)
  const n = gw * gh
  const { off, offCtx } = makeOffscreen(gw, gh)
  return {
    cfg, w, h, field, agents,
    trail: new Float32Array(n), scratch: new Float32Array(n),
    lut: buildLUT(cfg),
    stepAcc: 0, aggHoldMs: 0, runStartT: -1,
    off, offCtx, img: offCtx.createImageData(gw, gh),
    dirty: true,
  }
}

/** Deposit a small amount into the trail cell nearest (nx, ny). */
function depositTrail(trail: Float32Array, gw: number, gh: number, nx: number, ny: number, amount: number): void {
  let xi = Math.floor(nx * gw); if (xi >= gw) xi = gw - 1
  let yi = Math.floor(ny * gh); if (yi >= gh) yi = gh - 1
  trail[yi * gw + xi] += amount
}

// Trail deposit + diffuse constants. Not user-exposed — deposit is a fixed
// per-pulse amount (trailPersistence is the user's lever on how it fades), and a
// touch of diffusion softens the accumulated streams into rivers rather than
// single-cell speckle.
const DEPOSIT_AMOUNT = 1
const TRAIL_DIFFUSE = 0.2

/** Toroidal 4-neighbor blur-then-decay of the trail field, matching the field's
 *  own wraparound so a stream crossing the edge stays continuous. */
function decayTrail(trail: Float32Array, scratch: Float32Array, gw: number, gh: number, keep: number): void {
  for (let y = 0; y < gh; y++) {
    const yUp = ((y - 1 + gh) % gh) * gw
    const yDn = ((y + 1) % gh) * gw
    const row = y * gw
    for (let x = 0; x < gw; x++) {
      const xL = (x - 1 + gw) % gw
      const xR = (x + 1) % gw
      const idx = row + x
      const c = trail[idx]
      const avg = (trail[row + xL] + trail[row + xR] + trail[yUp + x] + trail[yDn + x]) * 0.25
      scratch[idx] = (c + (avg - c) * TRAIL_DIFFUSE) * keep
    }
  }
  trail.set(scratch)
}

const MAX_STEPS_PER_FRAME = 4

/** Advance the field + agent layers, dt-scaled (frame-rate independent). Runs
 *  cfg.waveSpeed field steps per second, carrying fractional backlog forward;
 *  agents and the trail deposit/decay advance in lockstep with the field so the
 *  whole sim is deterministic per (seed, config, dt-sequence). */
export function advance(state: SlimeAggregationState, dt: number): void {
  const { cfg, field, agents, trail, scratch } = state
  state.stepAcc += cfg.waveSpeed * (dt / 1000)
  let steps = Math.floor(state.stepAcc)
  if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME
  state.stepAcc -= steps
  if (state.stepAcc > MAX_STEPS_PER_FRAME) state.stepAcc = MAX_STEPS_PER_FRAME
  const dtSecPerStep = 1 / cfg.waveSpeed
  for (let s = 0; s < steps; s++) {
    stepField(field, cfg)
    stepAgents(agents, field, cfg, dtSecPerStep)
    for (let i = 0; i < agents.x.length; i++) {
      if (agents.moving[i]) depositTrail(trail, field.gw, field.gh, agents.x[i], agents.y[i], DEPOSIT_AMOUNT)
    }
    decayTrail(trail, scratch, field.gw, field.gh, cfg.trailPersistence)
    state.dirty = true
  }
}

/** Live-apply a config edit in place; return false for a structural change (the
 *  framework then tears down and re-runs setup()). */
export function updateSlimeState(state: SlimeAggregationState, cfg: SlimeAggregationConfig): boolean {
  for (const k of STRUCTURAL) {
    if (cfg[k] !== state.cfg[k]) return false
  }
  const paletteChanged = cfg.palette.join() !== state.cfg.palette.join() || cfg.contrast !== state.cfg.contrast
  const streamChanged = cfg.streamColor !== state.cfg.streamColor
  state.cfg = cfg
  if (paletteChanged) state.lut = buildLUT(cfg)
  if (paletteChanged || streamChanged) state.dirty = true
  return true
}

/** Re-fit to a new display size. The field's grid geometry is reallocated (and
 *  reset to rest) only when the cell count actually changes; agents and
 *  pacemakers live in normalized [0,1) world coordinates so they need no
 *  remapping and survive the resize untouched. */
export function resizeSlimeState(state: SlimeAggregationState, size: Size): void {
  state.w = size.width
  state.h = size.height
  const { gw, gh } = fieldDims(size.width, size.height, state.cfg.cellSize)
  if (gw === state.field.gw && gh === state.field.gh) return
  const n = gw * gh
  state.field.gw = gw
  state.field.gh = gh
  state.field.state = new Uint8Array(n)
  state.field.stateB = new Uint8Array(n)
  state.field.timer = new Uint16Array(n)
  state.field.timerB = new Uint16Array(n)
  state.trail = new Float32Array(n)
  state.scratch = new Float32Array(n)
  state.off.width = gw
  state.off.height = gh
  state.img = state.offCtx.createImageData(gw, gh)
  state.dirty = true
}

// Reseed lifecycle ("on aggregation or a timer"): a mound is "formed" once most
// of the population has arrived within AGG_RADIUS of some pacemaker and stayed
// there a beat (AGG_HOLD_MS) — the "parts become whole" payoff has read on
// screen. MAX_RUN_MS is a safety net so no parameter combination can leave the
// dish running forever without ever converging.
const AGG_RADIUS = 0.05
const AGG_THRESHOLD = 0.55
const AGG_HOLD_MS = 4000
const MAX_RUN_MS = 90000

export function shouldRestartSlime(state: SlimeAggregationState, t: number, dt: number): boolean {
  if (state.runStartT < 0) state.runStartT = t
  const frac = aggregationFraction(state.agents, state.field.pacemakers, AGG_RADIUS)
  if (frac >= AGG_THRESHOLD) state.aggHoldMs += dt
  else state.aggHoldMs = 0
  if (state.aggHoldMs >= AGG_HOLD_MS) return true
  return t - state.runStartT >= MAX_RUN_MS
}
