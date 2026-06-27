import type { Diversion } from '../../framework/types'
import { sampleGradient, trailFadeAlpha, toHex2 } from '../flow-field/flowField'
import { gravityWellsSchema, type GravityWellsConfig } from './schema'
import {
  createGravityState, maintainWells, advanceFieldTime, fieldAt,
  respawnParticle, outOfBounds, colorT, wellEnvelope,
  type GravityState,
} from './gravityWells'

interface GWState extends GravityState { styles: string[] }

function buildStyles(cfg: GravityWellsConfig): string[] {
  return cfg.color.colors.length ? cfg.color.colors : ['#ffffffff']
}

interface Rgb { r: number; g: number; b: number }
function hexRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  }
}

function assignColorIndices(state: GWState): void {
  const n = state.styles.length
  for (const p of state.particles) p.ci = Math.floor(state.rng() * n)
}

const gravityWells: Diversion<GravityWellsConfig, GWState, '2d'> = {
  id: 'gravity-wells',
  title: 'Gravity Wells',
  description: 'Particles caught in a field of gravity wells that appear and fade.',
  kind: '2d',
  schema: gravityWellsSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    const base = createGravityState(config, size.width, size.height)
    const state: GWState = { ...base, styles: buildStyles(config) }
    assignColorIndices(state)
    return state
  },

  update(state, config, size) {
    // structural changes (particle count, seed) → full re-setup
    if (config.particles !== state.cfg.particles || config.seed !== state.cfg.seed) return false
    state.cfg = config
    state.styles = buildStyles(config)
    state.w = size.width
    state.h = size.height
    return true
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
  },

  frame(state, ctx, t, dt) {
    const { cfg, particles, wells, rng, styles, w, h } = state

    // 1. trail fade (or hard clear) — reuse flow-field's survival-frames mapping
    ctx.globalCompositeOperation = 'source-over'
    const fadeAlpha = cfg.fadeTrails ? trailFadeAlpha(cfg.trailLength) : 1
    ctx.fillStyle = `${cfg.background}${toHex2(fadeAlpha)}`
    ctx.fillRect(0, 0, w, h)

    // 2. advance the well pool + the noise morph clock
    maintainWells(wells, dt, rng, cfg, w, h)
    state.fieldTime = advanceFieldTime(state.fieldTime, dt, cfg.fieldDrift)

    // 3. particles follow the blended field (1st-order — no momentum)
    ctx.globalCompositeOperation =
      (cfg.blend === 'normal' ? 'source-over' : cfg.blend) as GlobalCompositeOperation
    ctx.lineWidth = cfg.particleSize
    ctx.lineCap = 'round'
    const step = cfg.speed * dt * 0.96 // px/ms·speed — matches Flow Field's pace
    for (const p of particles) {
      p.age += dt
      if (p.age >= p.life || outOfBounds(p, w, h)) { respawnParticle(p, rng, w, h); continue }
      const px = p.x, py = p.y
      const { dx, dy, strength } = fieldAt(state, px, py)
      p.x = px + dx * step
      p.y = py + dy * step
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { respawnParticle(p, rng, w, h); continue }
      ctx.strokeStyle = cfg.color.mode === 'gradient'
        ? sampleGradient(
            cfg.color.stops,
            colorT(cfg.color.source, p, Math.atan2(dy, dx), strength, w, h),
            cfg.color.source === 'flow-angle',
          )
        : styles[p.ci % styles.length]
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }

    // 4. well markers — a soft tonal halo, no edges: an attractor gently DARKENS
    //    the flow (a subtle sink), a repulsor gently LIGHTENS it (a soft bloom).
    //    Low alpha + blurred radial falloff so it blends; a slow breath is the
    //    only motion. Present if you look, invisible if you don't.
    ctx.globalCompositeOperation = 'source-over'
    const bg = hexRgb(cfg.background)
    const sink = mixRgb(bg, { r: 0, g: 0, b: 0 }, 0.55)       // darker than bg
    const bloom = mixRgb(bg, { r: 200, g: 210, b: 235 }, 0.4) // lighter than bg
    for (const wl of wells) {
      const env = wellEnvelope(wl)
      if (env <= 0.01) continue
      const attract = wl.force >= 0
      const breath = 0.5 + 0.5 * Math.sin(t / 2200 + (wl.x + wl.y) * 0.01) // ~14s, desynced
      const R = (30 + Math.min(2, Math.abs(wl.force)) * 30) * (0.72 + 0.28 * breath)
      const alpha = env * 0.3 * (0.55 + 0.45 * breath)
      const c = attract ? sink : bloom
      const grad = ctx.createRadialGradient(wl.x, wl.y, 0, wl.x, wl.y, R)
      grad.addColorStop(0, `rgba(${c.r},${c.g},${c.b},${alpha.toFixed(3)})`)
      grad.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(wl.x, wl.y, R, 0, Math.PI * 2)
      ctx.fill()
    }
  },
}

export default gravityWells
