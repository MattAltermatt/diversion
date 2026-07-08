// render.ts — alpha-fade trails + heading-tinted triangle boids + an optional
// predator sprite. World→screen via a cover-fit transform (drawn in CSS pixels;
// the host DPR-scales the 2D context). Boid/predator sizes are constant SCREEN
// pixels (not run through the cover-fit scale) so they read the same size at any
// window size — mirrors flock-vs-hunter's render.ts convention.
import type { Size } from '../../framework/types'
import { WORLD_W, WORLD_H, type Flock } from './sim'
import type { BoidsConfig } from './schema'

const TAU = Math.PI * 2

function coverFit(size: Size): { scale: number; ox: number; oy: number } {
  const scale = Math.max(size.width / WORLD_W, size.height / WORLD_H) // cover
  const ox = (size.width - WORLD_W * scale) / 2
  const oy = (size.height - WORLD_H * scale) / 2
  return { scale, ox, oy }
}

function paletteColor(heading: number, colors: string[]): string {
  const frac = ((heading + Math.PI) / TAU + 1) % 1 // 0..1 around the compass
  const idx = Math.min(colors.length - 1, Math.floor(frac * colors.length))
  return colors[idx] ?? colors[0]
}

export function drawScene(ctx: CanvasRenderingContext2D, s: Flock, cfg: BoidsConfig, size: Size): void {
  // trail fade: translucent bg rect (higher trailLength = slower fade = longer streaks)
  const fadeAlpha = cfg.fadeTrails ? Math.max(0.05, 1 - cfg.trailLength) : 1
  ctx.globalAlpha = fadeAlpha
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.globalAlpha = 1

  const { scale, ox, oy } = coverFit(size)
  const sx = (wx: number) => ox + wx * scale
  const sy = (wy: number) => oy + wy * scale

  const colors = cfg.palette
  const r = cfg.boidSize
  for (let i = 0; i < s.n; i++) {
    const heading = Math.atan2(s.vy[i], s.vx[i])
    ctx.fillStyle = paletteColor(heading, colors)
    const x = sx(s.px[i]), y = sy(s.py[i])
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(heading) * r * 1.7, y + Math.sin(heading) * r * 1.7)
    ctx.lineTo(x + Math.cos(heading + 2.5) * r, y + Math.sin(heading + 2.5) * r)
    ctx.lineTo(x + Math.cos(heading - 2.5) * r, y + Math.sin(heading - 2.5) * r)
    ctx.closePath()
    ctx.fill()
  }

  if (cfg.predator) {
    const heading = Math.atan2(s.predVY, s.predVX)
    const x = sx(s.predX), y = sy(s.predY)
    const pr = r * 2.1
    ctx.fillStyle = '#ff4d4d'
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(heading) * pr * 1.7, y + Math.sin(heading) * pr * 1.7)
    ctx.lineTo(x + Math.cos(heading + 2.5) * pr, y + Math.sin(heading + 2.5) * pr)
    ctx.lineTo(x + Math.cos(heading - 2.5) * pr, y + Math.sin(heading - 2.5) * pr)
    ctx.closePath()
    ctx.fill()
  }
}
