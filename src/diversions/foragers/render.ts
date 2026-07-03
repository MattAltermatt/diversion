// render.ts — alpha-fade trails, forager/pellet sprites, leader ring, eat flashes
// and HUD. World→screen via a cover-fit transform (drawn in CSS pixels; the host
// DPR-scales the 2D context).
import type { Size } from '../../framework/types'
import { WORLD_W, WORLD_H, leaderIndex, type Arena } from './arena'
import type { ForagersConfig } from './schema'

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

export function drawArena(ctx: CanvasRenderingContext2D, arena: Arena, cfg: ForagersConfig, size: Size): void {
  // Trail fade: paint a translucent background each frame (higher trailFade = longer trails).
  ctx.globalAlpha = cfg.trailFade > 0 ? 1 - cfg.trailFade : 1
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.globalAlpha = 1

  const { scale, ox, oy } = coverFit(size)
  const sx = (wx: number) => ox + wx * scale
  const sy = (wy: number) => oy + wy * scale

  // Food — small bright dots.
  ctx.fillStyle = cfg.foodColor
  for (const p of arena.food) {
    ctx.beginPath()
    ctx.arc(sx(p.x), sy(p.y), 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Poison — small dark/red dots, drawn with a thin bright rim for contrast.
  ctx.fillStyle = cfg.poisonColor
  for (const p of arena.poison) {
    ctx.beginPath()
    ctx.arc(sx(p.x), sy(p.y), 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Foragers — cool triangles tinted slow→fast, flashing on a fresh meal
  // (white for food, red for poison).
  const [sr, sg, sb] = hexRgb(cfg.creatureColors.slow)
  const [fr, fg, fb] = hexRgb(cfg.creatureColors.fast)
  for (const c of arena.pop) {
    const t = Math.min(1, c.speed / cfg.maxSpeed)
    if (c.flash > 0) ctx.fillStyle = c.flashBad ? 'rgba(255,70,70,0.95)' : 'rgba(255,255,255,0.95)'
    else ctx.fillStyle = `rgb(${lerp(sr, fr, t)},${lerp(sg, fg, t)},${lerp(sb, fb, t)})`
    triangle(ctx, sx(c.x), sy(c.y), c.heading, 4.5)
  }

  // Eat flashes — expanding rings (white = food, red = poison).
  for (const f of arena.fx) {
    const a = Math.max(0, f.ttl / 0.4)
    ctx.strokeStyle = f.bad ? `rgba(255,80,80,${a * 0.8})` : `rgba(255,255,255,${a * 0.8})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(sx(f.x), sy(f.y), (1 - a) * 20 + 5, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Leader ring — this round's best-fitness forager so far.
  if (cfg.showLeaders) {
    const idx = leaderIndex(arena.pop)
    if (idx >= 0) {
      const c = arena.pop[idx]
      ctx.strokeStyle = cfg.creatureColors.fast
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(sx(c.x), sy(c.y), 13, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  if (cfg.showHud) drawHud(ctx, arena)
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
  ctx.fillText(`foragers ${arena.pop.length}   ·   food ${arena.food.length}   ·   poison ${arena.poison.length}   ·   round ${secs.toFixed(0)}s`, 14, 42)
  ctx.fillStyle = '#9fb4ff'
  ctx.fillText(`best fitness (last gen) ${arena.bestFitness.toFixed(1)}   ·   avg food eaten (last gen) ${arena.avgFoodLastRound.toFixed(1)}`, 14, 58)
  ctx.restore()
}
