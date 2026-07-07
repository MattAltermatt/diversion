// render.ts — alpha-fade trails + boid/predator sprites + HUD. World→screen via a
// cover-fit transform (drawn in CSS pixels; the host DPR-scales the 2D context).
import type { Size } from '../../framework/types'
import { hexToRgb } from '../../framework/color'
import { WORLD_W, WORLD_H, type Ecosystem } from './sim'
import { FLOCK_SPEC, PRED_SPEC, F, gene } from './genome'
import type { FlockVsHunterConfig } from './schema'

function coverFit(size: Size): { scale: number; ox: number; oy: number } {
  const scale = Math.max(size.width / WORLD_W, size.height / WORLD_H) // cover
  const ox = (size.width - WORLD_W * scale) / 2
  const oy = (size.height - WORLD_H * scale) / 2
  return { scale, ox, oy }
}

export function drawScene(ctx: CanvasRenderingContext2D, s: Ecosystem, cfg: FlockVsHunterConfig, size: Size): void {
  // trail fade: translucent bg rect (higher trailFade = slower fade = longer trails)
  const fadeAlpha = 1 - cfg.trailFade
  ctx.globalAlpha = cfg.trailFade > 0 ? fadeAlpha : 1
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.globalAlpha = 1

  const { scale, ox, oy } = coverFit(size)
  const sx = (wx: number) => ox + wx * scale
  const sy = (wy: number) => oy + wy * scale

  // boids: triangles oriented to velocity, tinted by speed across flockColors
  const colors = cfg.flockColors
  for (let i = 0; i < s.n; i++) {
    if (!s.alive[i]) continue
    const sp = Math.hypot(s.vx[i], s.vy[i])
    const maxSp = s.flockGenomes[i][F.spd] // hot loop: raw index, not string-keyed gene()
    const ci = Math.min(colors.length - 1, Math.floor((sp / maxSp) * colors.length))
    ctx.fillStyle = colors[ci] ?? colors[0]
    const ang = Math.atan2(s.vy[i], s.vx[i])
    const x = sx(s.px[i]), y = sy(s.py[i]), r = 4
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(ang) * r * 1.6, y + Math.sin(ang) * r * 1.6)
    ctx.lineTo(x + Math.cos(ang + 2.5) * r, y + Math.sin(ang + 2.5) * r)
    ctx.lineTo(x + Math.cos(ang - 2.5) * r, y + Math.sin(ang - 2.5) * r)
    ctx.closePath()
    ctx.fill()
  }

  // predators: bold larger triangles
  ctx.fillStyle = cfg.predatorColor
  for (let k = 0; k < s.pn; k++) {
    const ang = Math.atan2(s.pvy[k], s.pvx[k])
    const x = sx(s.ppx[k]), y = sy(s.ppy[k]), r = 8
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(ang) * r * 1.8, y + Math.sin(ang) * r * 1.8)
    ctx.lineTo(x + Math.cos(ang + 2.5) * r, y + Math.sin(ang + 2.5) * r)
    ctx.lineTo(x + Math.cos(ang - 2.5) * r, y + Math.sin(ang - 2.5) * r)
    ctx.closePath()
    ctx.fill()
  }

  if (cfg.showHud) drawHud(ctx, s, cfg)
}

/** HUD ink derived from the (user-editable) background luminance, so text + bars
 *  keep contrast whether the background is dark (default) or a light custom color. */
function hudInk(background: string): string {
  const [r, g, b] = hexToRgb(background) // normalized 0..1 channels
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.55 ? '20,24,32' : '255,255,255'
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, label: string, ink: string): void {
  ctx.fillStyle = `rgba(${ink},0.13)`
  ctx.fillRect(x, y, w, 6)
  ctx.fillStyle = `rgba(${ink},0.80)`
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 6)
  ctx.fillStyle = `rgba(${ink},0.67)`
  ctx.font = '10px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(label, x + w + 6, y + 6)
}

function drawHud(ctx: CanvasRenderingContext2D, s: Ecosystem, cfg: FlockVsHunterConfig): void {
  const ink = hudInk(cfg.background)
  let aliveCount = 0
  for (let i = 0; i < s.n; i++) aliveCount += s.alive[i]
  const survivors = Math.round((aliveCount / s.n) * 100)
  ctx.save()
  ctx.fillStyle = `rgba(${ink},1)`
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`gen ${s.generation}`, 14, 24)
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(`survivors ${survivors}%`, 14, 42)
  const elite = s.flockGenomes[0]
  let y = 60
  for (const spec of FLOCK_SPEC) {
    const v = gene(elite, FLOCK_SPEC, spec.key)
    bar(ctx, 14, y, 60, (v - spec.min) / (spec.max - spec.min), spec.key, ink)
    y += 12
  }
  const pElite = s.predGenomes[0]
  y += 6
  for (const spec of PRED_SPEC) {
    const v = gene(pElite, PRED_SPEC, spec.key)
    bar(ctx, 14, y, 60, (v - spec.min) / (spec.max - spec.min), spec.key, ink)
    y += 12
  }
  ctx.restore()
}
