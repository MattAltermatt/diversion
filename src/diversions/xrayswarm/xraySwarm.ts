import { mulberry32 } from '../../framework/rng'
import { parseHex6, mix, rgba, type RGB } from '../../framework/color'
import type { XraySwarmConfig } from './schema'

// Motion after xscreensaver's `xrayswarm` (Chris Leger, 2000; "a shameless
// ripoff of the 'swarm' screensaver on SGI boxes"). Each swarm has one
// invisible, wandering "leader" (the original's `targets`) with capped
// velocity + random acceleration, bouncing off the canvas edges. Every agent
// (the original's `bugs`) steers toward its swarm's leader — accelerate along
// atan2(leader - self + noise), clamp speed to [min, max], integrate, bounce.
// We simplify the original's N-leader "closest target" reassignment to one
// fixed leader per swarm (clean-room simplification, not a copy of the C):
// it keeps each swarm visually coherent as its own glowing colour, matching
// the "swarm of agents chases a wandering leader" read from the source.

export const FIXED_DT = 16 // ms; deterministic fixed-step, ~one per 60fps frame
export const MAX_TRAIL_LEN = 90 // matches the schema's trailLength max

const LEADER_ACCEL_RATIO = 1.6 // leader accel = leaderSpeed * this (px/s^2 per px/s)
const MIN_VEL_RATIO = 0.35 // agents never coast below this fraction of top speed
const NOISE_PX_SCALE = 50 // px; wobble=1 jitters the follow target by up to this much

export interface Leader {
  x: number
  y: number
  vx: number
  vy: number
}

export interface Agent {
  x: number
  y: number
  vx: number
  vy: number
  hx: Float32Array // ring buffer of recent x positions (trail history)
  hy: Float32Array
  n: number // total positions ever pushed (uncapped counter; index via % MAX_TRAIL_LEN)
}

export interface Swarm {
  leader: Leader
  agents: Agent[]
}

export interface XraySwarmState {
  cfg: XraySwarmConfig
  w: number
  h: number
  swarms: Swarm[]
  rng: () => number
  colors: RGB[] // one per swarm, index-aligned with swarms
  bg: RGB
  acc: number // fixed-step accumulator (ms)
}

/** Cyclic linear interpolation across `cols` at t (wraps end→start). */
function sampleCyclicRGB(cols: RGB[], t: number): RGB {
  const n = cols.length
  if (n === 1) return cols[0]
  const tc = ((t % 1) + 1) % 1
  const f = tc * n
  const i = Math.floor(f) % n
  const frac = f - Math.floor(f)
  return mix(cols[i], cols[(i + 1) % n], frac)
}

/** One colour per swarm, spread evenly around the palette wheel. */
export function buildSwarmColors(cfg: XraySwarmConfig): RGB[] {
  const cols = cfg.palette.map(parseHex6)
  const out: RGB[] = new Array(cfg.swarmCount)
  for (let i = 0; i < cfg.swarmCount; i++) out[i] = sampleCyclicRGB(cols, i / cfg.swarmCount)
  return out
}

function newAgent(x: number, y: number, vx: number, vy: number): Agent {
  const hx = new Float32Array(MAX_TRAIL_LEN)
  const hy = new Float32Array(MAX_TRAIL_LEN)
  hx[0] = x
  hy[0] = y
  return { x, y, vx, vy, hx, hy, n: 1 }
}

function createSwarm(rng: () => number, cfg: XraySwarmConfig, w: number, h: number): Swarm {
  const leader: Leader = {
    x: rng() * w,
    y: rng() * h,
    vx: (rng() * 2 - 1) * cfg.leaderSpeed * 0.3,
    vy: (rng() * 2 - 1) * cfg.leaderSpeed * 0.3,
  }
  const agents: Agent[] = []
  for (let i = 0; i < cfg.agentsPerSwarm; i++) {
    const x = Math.min(w, Math.max(0, leader.x + (rng() * 2 - 1) * 40))
    const y = Math.min(h, Math.max(0, leader.y + (rng() * 2 - 1) * 40))
    const vx = (rng() * 2 - 1) * cfg.speed * 0.3
    const vy = (rng() * 2 - 1) * cfg.speed * 0.3
    agents.push(newAgent(x, y, vx, vy))
  }
  return { leader, agents }
}

export function createXraySwarmState(cfg: XraySwarmConfig, w: number, h: number): XraySwarmState {
  const rng = mulberry32(cfg.seed >>> 0)
  const swarms: Swarm[] = []
  for (let i = 0; i < cfg.swarmCount; i++) swarms.push(createSwarm(rng, cfg, w, h))
  return {
    cfg, w, h, swarms, rng,
    colors: buildSwarmColors(cfg),
    bg: parseHex6(cfg.background),
    acc: 0,
  }
}

function bounce(pos: number, vel: number, max: number): [number, number] {
  if (pos < 0) return [-pos, -vel]
  if (pos > max) return [2 * max - pos, -vel]
  return [pos, vel]
}

function stepLeader(leader: Leader, cfg: XraySwarmConfig, rng: () => number, w: number, h: number, dtSec: number): void {
  const theta = rng() * Math.PI * 2
  const accel = cfg.leaderSpeed * LEADER_ACCEL_RATIO
  leader.vx += accel * Math.cos(theta) * dtSec
  leader.vy += accel * Math.sin(theta) * dtSec

  const speedSq = leader.vx * leader.vx + leader.vy * leader.vy
  const maxSq = cfg.leaderSpeed * cfg.leaderSpeed
  if (speedSq > maxSq && speedSq > 1e-9) {
    const k = cfg.leaderSpeed / Math.sqrt(speedSq)
    leader.vx *= k
    leader.vy *= k
  }

  leader.x += leader.vx * dtSec
  leader.y += leader.vy * dtSec
  const [nx, nvx] = bounce(leader.x, leader.vx, w)
  const [ny, nvy] = bounce(leader.y, leader.vy, h)
  leader.x = nx; leader.vx = nvx
  leader.y = ny; leader.vy = nvy
}

function stepAgent(
  agent: Agent, leader: Leader, cfg: XraySwarmConfig, rng: () => number,
  w: number, h: number, dtSec: number,
): void {
  const noiseAmp = cfg.wobble * NOISE_PX_SCALE
  const dx = leader.x - agent.x + (rng() * 2 - 1) * noiseAmp
  const dy = leader.y - agent.y + (rng() * 2 - 1) * noiseAmp
  const theta = Math.atan2(dy, dx)
  agent.vx += cfg.chaseForce * Math.cos(theta) * dtSec
  agent.vy += cfg.chaseForce * Math.sin(theta) * dtSec

  const speedSq = agent.vx * agent.vx + agent.vy * agent.vy
  const maxSq = cfg.speed * cfg.speed
  const minV = cfg.speed * MIN_VEL_RATIO
  const minSq = minV * minV
  if (speedSq > maxSq && speedSq > 1e-9) {
    const k = cfg.speed / Math.sqrt(speedSq)
    agent.vx *= k
    agent.vy *= k
  } else if (speedSq < minSq && speedSq > 1e-9) {
    const k = minV / Math.sqrt(speedSq)
    agent.vx *= k
    agent.vy *= k
  }

  agent.x += agent.vx * dtSec
  agent.y += agent.vy * dtSec
  const [nx, nvx] = bounce(agent.x, agent.vx, w)
  const [ny, nvy] = bounce(agent.y, agent.vy, h)
  agent.x = nx; agent.vx = nvx
  agent.y = ny; agent.vy = nvy

  const idx = agent.n % MAX_TRAIL_LEN
  agent.hx[idx] = agent.x
  agent.hy[idx] = agent.y
  agent.n++
}

/** Advance every swarm exactly one fixed step. Pure w.r.t. the seeded rng, so
 *  the same seed produces the same paths. */
export function stepXraySwarmOnce(state: XraySwarmState): void {
  const dtSec = FIXED_DT / 1000
  for (const swarm of state.swarms) {
    stepLeader(swarm.leader, state.cfg, state.rng, state.w, state.h, dtSec)
    for (const agent of swarm.agents) {
      stepAgent(agent, swarm.leader, state.cfg, state.rng, state.w, state.h, dtSec)
    }
  }
}

/** Advance the sim by real frame time, drained in fixed steps. */
export function stepXraySwarm(state: XraySwarmState, dt: number): void {
  state.acc = Math.min(state.acc + dt, FIXED_DT * 6) // clamp catch-up after a stall
  while (state.acc >= FIXED_DT) {
    stepXraySwarmOnce(state)
    state.acc -= FIXED_DT
  }
}

/** Live-apply a config change. Swarm/agent counts and the seed reshape the
 *  swarm array itself, so those need a fresh setup. Everything else (speed,
 *  chase force, trail look, palette, background) reads live. */
export function updateXraySwarmState(state: XraySwarmState, cfg: XraySwarmConfig): boolean {
  if (cfg.swarmCount !== state.cfg.swarmCount) return false
  if (cfg.agentsPerSwarm !== state.cfg.agentsPerSwarm) return false
  if (cfg.seed !== state.cfg.seed) return false

  const paletteChanged = cfg.palette.join() !== state.cfg.palette.join()
  const bgChanged = cfg.background !== state.cfg.background
  state.cfg = cfg
  if (paletteChanged) state.colors = buildSwarmColors(cfg)
  if (bgChanged) state.bg = parseHex6(cfg.background)
  return true
}

/** Full clear + redraw every filament's whole recent-history polyline, bright,
 *  every frame — the ribbon body stays saturated instead of decaying to a grey
 *  persistence-buffer ghost (the sparse-stroke-trail gotcha). Two-layer stroke:
 *  a wide additive halo under a narrow opaque core, so overlapping filaments
 *  bloom instead of blowing out to white. */
export function drawXraySwarm(state: XraySwarmState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, swarms, colors } = state

  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = rgba(state.bg, 1)
  ctx.fillRect(0, 0, w, h)

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let s = 0; s < swarms.length; s++) {
    const col = colors[s]
    for (const agent of swarms[s].agents) {
      const used = Math.min(agent.n, cfg.trailLength, MAX_TRAIL_LEN)
      if (used < 2) continue
      const start = agent.n - used
      ctx.beginPath()
      for (let k = start; k < agent.n - 1; k++) {
        const a = k % MAX_TRAIL_LEN
        const b = (k + 1) % MAX_TRAIL_LEN
        ctx.moveTo(agent.hx[a], agent.hy[a])
        ctx.lineTo(agent.hx[b], agent.hy[b])
      }
      ctx.globalCompositeOperation = 'lighter' // halo — wide, dim, additive
      ctx.strokeStyle = rgba(col, cfg.glow)
      ctx.lineWidth = cfg.glowWidth
      ctx.stroke()
      ctx.globalCompositeOperation = 'source-over' // core — narrow, opaque
      ctx.strokeStyle = rgba(col, 1)
      ctx.lineWidth = cfg.lineWidth
      ctx.stroke()
    }
  }
  ctx.globalCompositeOperation = 'source-over'
}
