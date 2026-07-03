// render.ts — alpha-fade trails, prey/predator sprites, leader rings, catch flashes
// and HUD. World→screen via a cover-fit transform (drawn in CSS pixels; the host
// DPR-scales the 2D context).
import type { Size } from '../../framework/types'
import { WORLD_W, WORLD_H, leaderIndex, type Arena, type Creature } from './arena'
import type { PursuitEvasionConfig } from './schema'

function coverFit(size: Size): { scale: number; ox: number; oy: number } {
  const scale = Math.max(size.width / WORLD_W, size.height / WORLD_H)
  return { scale, ox: (size.width - WORLD_W * scale) / 2, oy: (size.height - WORLD_H * scale) / 2 }
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

function triangle(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + Math.cos(ang) * r * 1.7, y + Math.sin(ang) * r * 1.7)
  ctx.lineTo(x + Math.cos(ang + 2.5) * r, y + Math.sin(ang + 2.5) * r)
  ctx.lineTo(x + Math.cos(ang - 2.5) * r, y + Math.sin(ang - 2.5) * r)
  ctx.closePath()
  ctx.fill()
}

export function drawArena(ctx: CanvasRenderingContext2D, arena: Arena, cfg: PursuitEvasionConfig, size: Size): void {
  // Trail fade: paint a translucent background each frame (higher trailFade = longer trails).
  ctx.globalAlpha = cfg.trailFade > 0 ? 1 - cfg.trailFade : 1
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.globalAlpha = 1

  const { scale, ox, oy } = coverFit(size)
  const sx = (wx: number) => ox + wx * scale
  const sy = (wy: number) => oy + wy * scale

  // Prey — cool triangles tinted slow→fast, flashing white just after a catch.
  const [sr, sg, sb] = hexRgb(cfg.preyColors.slow)
  const [fr, fg, fb] = hexRgb(cfg.preyColors.fast)
  for (const p of arena.prey) {
    const t = Math.min(1, p.speed / cfg.preySpeed)
    if (p.flash > 0) ctx.fillStyle = 'rgba(255,255,255,0.95)'
    else ctx.fillStyle = `rgb(${lerp(sr, fr, t)},${lerp(sg, fg, t)},${lerp(sb, fb, t)})`
    triangle(ctx, sx(p.x), sy(p.y), p.heading, 4)
  }

  // Predators — bold warm triangles, larger.
  ctx.fillStyle = cfg.predatorColor
  for (const h of arena.predators) triangle(ctx, sx(h.x), sy(h.y), h.heading, 7.5)

  // Catch flashes — expanding rings.
  for (const f of arena.fx) {
    const a = Math.max(0, f.ttl / 0.5)
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(sx(f.x), sy(f.y), (1 - a) * 26 + 6, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Leader rings — this round's best survivor and best hunter.
  if (cfg.showLeaders) {
    ring(ctx, arena.prey, leaderIndex(arena.prey), sx, sy, cfg.preyColors.fast)
    ring(ctx, arena.predators, leaderIndex(arena.predators, true), sx, sy, cfg.predatorColor)
  }

  if (cfg.showHud) drawHud(ctx, arena)
}

function ring(ctx: CanvasRenderingContext2D, pop: Creature[], idx: number, sx: (n: number) => number, sy: (n: number) => number, color: string): void {
  if (idx < 0) return
  const c = pop[idx]
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(sx(c.x), sy(c.y), 13, 0, Math.PI * 2)
  ctx.stroke()
}

function drawHud(ctx: CanvasRenderingContext2D, arena: Arena): void {
  ctx.save()
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.fillText(`gen ${arena.gen}`, 14, 24)
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillStyle = '#dfe6ff'
  const secs = Math.max(0, arena.cfg.roundSeconds - arena.roundTime)
  ctx.fillText(`prey ${arena.prey.length}   ·   predators ${arena.predators.length}   ·   round ${secs.toFixed(0)}s`, 14, 42)
  ctx.fillStyle = '#9fb4ff'
  ctx.fillText(`catches this round ${arena.catchesThisRound}   ·   last-gen best hunter ${arena.bestPred}`, 14, 58)
  ctx.restore()
}
