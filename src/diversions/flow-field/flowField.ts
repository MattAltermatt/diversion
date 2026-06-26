import { makeNoise2D, mulberry32 } from './noise'
import type { FlowFieldConfig } from './schema'

interface Particle {
  x: number
  y: number
  age: number
  life: number
}

export interface FlowState {
  particles: Particle[]
  noise: (x: number, y: number) => number
  rng: () => number // seeded — keeps respawns deterministic per seed
  cfg: FlowFieldConfig
  w: number
  h: number
}

// Particle recycling lifespans, in frames. Without respawning, every particle
// drifts onto the field's dominant attractor and the rest of the field empties
// out — so particles get a finite, staggered life and respawn at a fresh
// position. These are mechanism constants, not visual balance knobs.
const MIN_LIFE = 80
const MAX_LIFE = 240

function randomLife(rng: () => number): number {
  return MIN_LIFE + rng() * (MAX_LIFE - MIN_LIFE)
}

export function createFlowState(cfg: FlowFieldConfig, w: number, h: number): FlowState {
  const noise = makeNoise2D(cfg.seed)
  // Separate seeded stream for particles (derived so it doesn't mirror the noise
  // grid's stream). Same seed → same particle layout AND respawns, every run.
  const rng = mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0)
  const particles: Particle[] = Array.from({ length: cfg.particles }, () => ({
    x: rng() * w,
    y: rng() * h,
    age: rng() * MAX_LIFE, // stagger initial ages so respawns don't pulse
    life: randomLife(rng),
  }))
  return { particles, noise, rng, cfg, w, h }
}

export function stepFlow(state: FlowState, ctx: CanvasRenderingContext2D, dt: number) {
  const { particles, noise, rng, cfg, w, h } = state
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
    p.age++
    if (p.age >= p.life) {
      p.x = rng() * w
      p.y = rng() * h
      p.age = 0
      p.life = randomLife(rng)
      continue // skip drawing this frame to avoid a streak from old→new position
    }

    const angle = noise(p.x * cfg.noiseScale, p.y * cfg.noiseScale) * Math.PI * 2
    const nx = p.x + Math.cos(angle) * speed * 16
    const ny = p.y + Math.sin(angle) * speed * 16
    const hue = cfg.palette.hueStart + (p.x / w) * cfg.palette.hueRange
    ctx.strokeStyle = `hsl(${hue}, 90%, 65%)`
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(nx, ny)
    ctx.stroke()
    p.x = (nx + w) % w
    p.y = (ny + h) % h
  }
}
