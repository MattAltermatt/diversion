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

export interface FlowState {
  particles: Particle[]
  noise: (x: number, y: number) => number
  rng: () => number // seeded — keeps respawns deterministic per seed
  styles: string[] // one precomputed rgba() per palette color — see hexToRgba
  cfg: FlowFieldConfig
  w: number
  h: number
}

// Particle recycling lifespans, in MILLISECONDS (so behavior is identical at
// 30/60/120fps). Without respawning, every particle drifts onto the field's
// dominant attractor and the rest of the field empties out — so particles get
// a finite, staggered life and respawn at a fresh position. Mechanism
// constants, not visual balance knobs (~1.3–4s).
const MIN_LIFE = 1333
const MAX_LIFE = 4000

function randomLife(rng: () => number): number {
  return MIN_LIFE + rng() * (MAX_LIFE - MIN_LIFE)
}

export function createFlowState(cfg: FlowFieldConfig, w: number, h: number): FlowState {
  const noise = makeNoise2D(cfg.seed)
  // Separate seeded stream for particles (derived so it doesn't mirror the noise
  // grid's stream). Same seed → same particle layout AND respawns, every run.
  const rng = mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0)
  const styles = cfg.palette.colors.map(hexToRgba)
  const n = cfg.palette.colors.length
  const particles: Particle[] = Array.from({ length: cfg.particles }, () => ({
    x: rng() * w,
    y: rng() * h,
    age: rng() * MAX_LIFE, // stagger initial ages so respawns don't pulse
    life: randomLife(rng),
    ci: Math.floor(rng() * n), // pick a palette color for this particle's life
  }))
  return { particles, noise, rng, styles, cfg, w, h }
}

export function stepFlow(state: FlowState, ctx: CanvasRenderingContext2D, dt: number) {
  const { particles, noise, rng, styles, cfg, w, h } = state
  // fade the canvas for trails (or hard-clear)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.fadeTrails ? `${cfg.palette.background}22` : cfg.palette.background
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
      p.life = randomLife(rng)
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
