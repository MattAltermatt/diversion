import { makeNoise2D } from './noise'
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
  cfg: FlowFieldConfig
  w: number
  h: number
}

// Particle recycling lifespans, in frames. Without respawning, every particle
// drifts onto the field's dominant attractor and the rest of the field empties
// out — so particles get a finite, staggered life and respawn at a fresh
// random position. These are mechanism constants, not visual balance knobs.
const MIN_LIFE = 80
const MAX_LIFE = 240

function randomLife(): number {
  return MIN_LIFE + Math.random() * (MAX_LIFE - MIN_LIFE)
}

export function createFlowState(cfg: FlowFieldConfig, w: number, h: number): FlowState {
  const noise = makeNoise2D(cfg.seed)
  const particles: Particle[] = Array.from({ length: cfg.particles }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    age: Math.random() * MAX_LIFE, // stagger initial ages so respawns don't pulse
    life: randomLife(),
  }))
  return { particles, noise, cfg, w, h }
}

export function stepFlow(state: FlowState, ctx: CanvasRenderingContext2D, dt: number) {
  const { particles, noise, cfg, w, h } = state
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
      p.x = Math.random() * w
      p.y = Math.random() * h
      p.age = 0
      p.life = randomLife()
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
