import { makeNoise2D } from './noise'
import type { FlowFieldConfig } from './schema'

interface Particle { x: number; y: number }

export interface FlowState {
  particles: Particle[]
  noise: (x: number, y: number) => number
  cfg: FlowFieldConfig
  w: number; h: number
}

export function createFlowState(cfg: FlowFieldConfig, w: number, h: number): FlowState {
  const noise = makeNoise2D(cfg.seed)
  const particles: Particle[] = Array.from({ length: cfg.particles }, () => ({
    x: Math.random() * w, y: Math.random() * h,
  }))
  return { particles, noise, cfg, w, h }
}

export function stepFlow(state: FlowState, ctx: CanvasRenderingContext2D, dt: number) {
  const { particles, noise, cfg, w, h } = state
  // fade the canvas for trails (or clear)
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.fadeTrails ? `${cfg.palette.background}22` : cfg.palette.background
  ctx.fillRect(0, 0, w, h)

  ctx.globalCompositeOperation = cfg.blend as GlobalCompositeOperation
  const speed = cfg.speed * dt * 0.06
  for (const p of particles) {
    const angle = noise(p.x * cfg.noiseScale, p.y * cfg.noiseScale) * Math.PI * 2
    const nx = p.x + Math.cos(angle) * speed * 16
    const ny = p.y + Math.sin(angle) * speed * 16
    const hue = cfg.palette.hueStart + ((p.x / w) * cfg.palette.hueRange)
    ctx.strokeStyle = `hsl(${hue}, 90%, 65%)`
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke()
    p.x = (nx + w) % w; p.y = (ny + h) % h
  }
}
