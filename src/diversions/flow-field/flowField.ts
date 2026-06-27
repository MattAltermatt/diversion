import { makeNoise2D, mulberry32 } from './noise'
import type { FlowFieldConfig } from './schema'

interface Particle {
  x: number
  y: number
  age: number
  life: number
  ci: number // index into the palette; chosen at spawn, kept for life
}

/** "#rrggbbaa" -> "rgba(r, g, b, a)" (alpha rounded to 3 dp). */
export function hexToRgba(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const a = Math.round((parseInt(hex.slice(7, 9), 16) / 255) * 1000) / 1000
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

const TRAIL_FADE_FLOOR = 0.02
/** trailLength 0..100 -> per-frame fade alpha 1.0..0.02 (higher length = longer trail). */
export function trailFadeAlpha(trailLength: number): number {
  const a = 1 - (trailLength / 100) * (1 - TRAIL_FADE_FLOOR)
  return Math.min(1, Math.max(TRAIL_FADE_FLOOR, a))
}
/** 0..1 alpha -> two-digit hex byte for hex-append (e.g. 0.1376 -> "23"). */
export function toHex2(alpha: number): string {
  return Math.round(alpha * 255).toString(16).padStart(2, '0')
}

export interface FlowState {
  particles: Particle[]
  noise: (x: number, y: number) => number
  rng: () => number // seeded — keeps respawns deterministic per seed
  styles: string[] // one precomputed rgba() per palette color — see hexToRgba
  cfg: FlowFieldConfig
  w: number
  h: number
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
  const noise = makeNoise2D(cfg.seed)
  // Separate seeded stream for particles (derived so it doesn't mirror the noise
  // grid's stream). Same seed → same particle layout AND respawns, every run.
  const rng = mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0)
  const styles = cfg.palette.colors.map(hexToRgba)
  const n = cfg.palette.colors.length
  const maxLife = lifeBounds(cfg.lifespan).max
  const particles: Particle[] = Array.from({ length: cfg.particles }, () => ({
    x: rng() * w,
    y: rng() * h,
    age: rng() * maxLife, // stagger initial ages so respawns don't pulse
    life: randomLife(rng, cfg.lifespan),
    ci: Math.floor(rng() * n), // pick a palette color for this particle's life
  }))
  return { particles, noise, rng, styles, cfg, w, h }
}

export function stepFlow(state: FlowState, ctx: CanvasRenderingContext2D, dt: number) {
  const { particles, noise, rng, styles, cfg, w, h } = state
  // fade the canvas for trails (alpha from the Trail length slider), or hard-clear
  ctx.globalCompositeOperation = 'source-over'
  const fadeAlpha = cfg.fadeTrails ? trailFadeAlpha(cfg.trailLength) : 1
  ctx.fillStyle = `${cfg.palette.background}${toHex2(fadeAlpha)}`
  ctx.fillRect(0, 0, w, h)

  // 'normal' is not a valid composite op — map it to the canvas default.
  ctx.globalCompositeOperation = (
    cfg.blend === 'normal' ? 'source-over' : cfg.blend
  ) as GlobalCompositeOperation
  const speed = cfg.speed * dt * 0.06
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

    const angle = noise(p.x * cfg.noiseScale, p.y * cfg.noiseScale) * Math.PI * 2
    const nx = p.x + Math.cos(angle) * speed * 16
    const ny = p.y + Math.sin(angle) * speed * 16
    // styles.length is >=1 (schema min); modulo keeps a stale index valid if the set shrank
    ctx.strokeStyle = styles[p.ci % styles.length]
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(nx, ny)
    ctx.stroke()
    p.x = (nx + w) % w
    p.y = (ny + h) % h
  }
}
