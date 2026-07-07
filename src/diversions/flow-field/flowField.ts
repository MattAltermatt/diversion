import { makeNoise3D, mulberry32 } from '../../framework/rng'
import {
  hexToRgba, trailFadeAlpha, toHex2, sampleGradient, buildGradientLUT, gradientIndex,
} from '../../framework/gradient'
import type { FlowFieldConfig } from './schema'

// Colour + trail-fade helpers now live in the framework; re-exported so existing
// flow-field imports (and its tests) keep resolving them from here.
export { hexToRgba, trailFadeAlpha, toHex2, sampleGradient }

// fieldTime advance per ms at fieldDrift=1. Tuned so max drift is "obviously
// moving" but organic (~1 noise-cell of z every ~12.5s). 🎚️ tunable.
const DRIFT_RATE = 0.00008
/** Advance the morph clock. drift=0 → unchanged (frozen field). */
export function advanceFieldTime(fieldTime: number, dt: number, fieldDrift: number): number {
  return fieldTime + dt * fieldDrift * DRIFT_RATE
}

interface Particle {
  x: number
  y: number
  age: number
  life: number
  ci: number // index into the palette; chosen at spawn, kept for life
}

/** Map a particle's chosen color source to t in [0,1]. flow-angle is cyclic
 *  (pairs with sampleGradient wrap=true); x/y are clamped screen fractions. */
export function colorSourceT(
  source: 'flow-angle' | 'x' | 'y',
  x: number, y: number, angle: number, w: number, h: number,
): number {
  if (source === 'x') return Math.min(1, Math.max(0, x / w))
  if (source === 'y') return Math.min(1, Math.max(0, y / h))
  const tau = Math.PI * 2
  return (((angle % tau) + tau) % tau) / tau
}

export interface FlowState {
  particles: Particle[]
  noise: (x: number, y: number, z: number) => number
  rng: () => number // seeded — keeps respawns deterministic per seed
  styles: string[] // one precomputed rgba() per palette color — see hexToRgba
  gradientLUT: string[] // precomputed rgba() LUT for gradient mode ([] in palette mode)
  fadeFillStyle: string // precomputed trail-fade wash ("#rrggbb"+alpha byte); config-only
  cfg: FlowFieldConfig
  fieldTime: number // morph clock; advances by dt·fieldDrift·DRIFT_RATE
  w: number
  h: number
}

/** The per-frame trail-fade wash colour — derived only from background + trail
 *  config, so precompute it on config change instead of every frame. */
function fadeFillStyleFor(cfg: FlowFieldConfig): string {
  const fadeAlpha = cfg.fadeTrails ? trailFadeAlpha(cfg.trailLength) : 1
  return `${cfg.background}${toHex2(fadeAlpha)}`
}

/** Precompute the gradient-mode colour LUT (empty in palette mode). The wrap flag
 *  matches the flow-angle source, which is cyclic. Rebuilt on config change. */
function gradientLUTFor(cfg: FlowFieldConfig): string[] {
  return cfg.color.mode === 'gradient'
    ? buildGradientLUT(cfg.color.stops, cfg.color.source === 'flow-angle')
    : []
}

// Particle lifespans are derived from the `lifespan` slider (seconds -> ms) so
// behavior is identical at any fps. The fixed ⅓ min/max ratio preserves the
// staggered respawns (anti-pulse) and keeps the field populated — without
// respawning, every particle drifts onto the dominant attractor and the rest
// empties out. The schema floor (0.5s) keeps the field from degenerating.
const LIFE_MIN_RATIO = 1 / 3
function lifeBounds(lifespanSeconds: number): { min: number; max: number } {
  const max = lifespanSeconds * 1000
  return { min: max * LIFE_MIN_RATIO, max }
}
function randomLife(rng: () => number, lifespanSeconds: number): number {
  const { min, max } = lifeBounds(lifespanSeconds)
  return min + rng() * (max - min)
}

export function createFlowState(cfg: FlowFieldConfig, w: number, h: number): FlowState {
  const noise = makeNoise3D(cfg.seed)
  // Separate seeded stream for particles (derived so it doesn't mirror the noise
  // grid's stream). Same seed → same particle layout AND respawns, every run.
  const rng = mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0)
  const styles = cfg.color.colors.map(hexToRgba)
  const n = cfg.color.colors.length
  const maxLife = lifeBounds(cfg.lifespan).max
  const particles: Particle[] = Array.from({ length: cfg.particles }, () => ({
    x: rng() * w,
    y: rng() * h,
    age: rng() * maxLife, // stagger initial ages so respawns don't pulse
    life: randomLife(rng, cfg.lifespan),
    ci: Math.floor(rng() * n), // pick a palette color for this particle's life
  }))
  return {
    particles, noise, rng, styles,
    gradientLUT: gradientLUTFor(cfg), fadeFillStyle: fadeFillStyleFor(cfg),
    cfg, fieldTime: 0, w, h,
  }
}

/** Apply a config change to a live FlowState in place. Returns false when the
 *  change is structural (particle count or seed) and needs a full re-setup;
 *  true when applied live. Every per-frame param is read live from state.cfg,
 *  so we just swap cfg and recompute the precomputed palette styles. */
export function updateFlowState(state: FlowState, cfg: FlowFieldConfig): boolean {
  if (cfg.particles !== state.cfg.particles || cfg.seed !== state.cfg.seed) return false
  state.cfg = cfg
  state.styles = cfg.color.colors.map(hexToRgba)
  state.gradientLUT = gradientLUTFor(cfg)
  state.fadeFillStyle = fadeFillStyleFor(cfg)
  return true
}

export function stepFlow(state: FlowState, ctx: CanvasRenderingContext2D, dt: number) {
  const { particles, noise, rng, styles, cfg, w, h } = state
  // fade the canvas for trails (alpha from the Trail length slider), or hard-clear
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = state.fadeFillStyle // precomputed from background + trail config
  ctx.fillRect(0, 0, w, h)

  // 'normal' is not a valid composite op — map it to the canvas default.
  ctx.globalCompositeOperation = (
    cfg.blend === 'normal' ? 'source-over' : cfg.blend
  ) as GlobalCompositeOperation
  // Stroke thickness for the particle segments; round caps keep thick strokes soft.
  ctx.lineWidth = cfg.particleSize
  ctx.lineCap = 'round'
  const speed = cfg.speed * dt * 0.06
  // advance the morph clock once per frame; z=0-rate when fieldDrift=0 (frozen)
  state.fieldTime = advanceFieldTime(state.fieldTime, dt, cfg.fieldDrift)
  const z = state.fieldTime
  for (const p of particles) {
    // recycle: respawn at a fresh position so the field stays populated
    p.age += dt
    if (p.age >= p.life) {
      p.x = rng() * w
      p.y = rng() * h
      p.age = 0
      p.life = randomLife(rng, cfg.lifespan)
      p.ci = Math.floor(rng() * styles.length)
      continue // skip drawing this frame to avoid a streak from old→new position
    }

    const angle = noise(p.x * cfg.noiseScale, p.y * cfg.noiseScale, z) * Math.PI * 2
    const nx = p.x + Math.cos(angle) * speed * 16
    const ny = p.y + Math.sin(angle) * speed * 16
    // Palette mode: each particle's spawn color. Gradient mode: sample the gradient
    // at the particle's color-source position (flow-angle wraps; x/y clamp).
    // styles.length is >=1 (schema min); modulo keeps a stale index valid if the set shrank
    ctx.strokeStyle = cfg.color.mode === 'gradient'
      ? state.gradientLUT[gradientIndex(colorSourceT(cfg.color.source, p.x, p.y, angle, w, h))]
      : styles[p.ci % styles.length]
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(nx, ny)
    ctx.stroke()
    p.x = (nx + w) % w
    p.y = (ny + h) % h
  }
}
