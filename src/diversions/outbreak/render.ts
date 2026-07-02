// render.ts — draw one frame. Cover-fits the fixed 1600×900 world into the CSS-pixel
// canvas and paints each faction as filled circles, batched (one fillStyle per faction)
// for speed. Foundation (#233) draws agents + background only; walls (#235), tracers /
// HUD / infection rings / blood (#236) layer on top later.
import { type Ecosystem, CIVILIAN, FIGHTER, ZOMBIE, WORLD_W, WORLD_H } from './sim'
import type { OutbreakConfig } from './schema'
import type { Size } from '../../framework/types'

export function drawScene(
  ctx: CanvasRenderingContext2D, e: Ecosystem, cfg: OutbreakConfig, size: Size,
): void {
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, size.width, size.height)

  // Contain-fit: the whole arena always fits inside the canvas (centered, letterboxed
  // into the background) rather than cover-cropping agents past the visible edges.
  const scale = Math.min(size.width / WORLD_W, size.height / WORLD_H)
  const ox = (size.width - WORLD_W * scale) / 2
  const oy = (size.height - WORLD_H * scale) / 2
  const r = Math.max(0.8, cfg.agentRadius * scale)

  const paint = (want: number, color: string) => {
    ctx.fillStyle = color
    ctx.beginPath()
    const { px, py, faction, alive } = e
    for (let i = 0; i < e.n; i++) {
      if (!alive[i] || faction[i] !== want) continue
      const x = ox + px[i] * scale, y = oy + py[i] * scale
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, Math.PI * 2)
    }
    ctx.fill()
  }

  // Civilians first (the crowd), then the two armies on top so they read.
  paint(CIVILIAN, cfg.civilianColor)
  paint(FIGHTER, cfg.fighterColor)
  paint(ZOMBIE, cfg.zombieColor)

  // Bullets as short tracer streaks (full muzzle-flash/tracer treatment is #236).
  ctx.strokeStyle = '#ffe08a'
  ctx.lineWidth = Math.max(1, scale)
  ctx.beginPath()
  const { bx, by, bvx, bvy, balive } = e
  for (let b = 0; b < balive.length; b++) {
    if (!balive[b]) continue
    const x = ox + bx[b] * scale, y = oy + by[b] * scale
    const tx = ox + (bx[b] - bvx[b] * 0.02) * scale, ty = oy + (by[b] - bvy[b] * 0.02) * scale
    ctx.moveTo(tx, ty); ctx.lineTo(x, y)
  }
  ctx.stroke()
}
