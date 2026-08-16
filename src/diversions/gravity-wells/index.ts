import { defineDiversion, type PresetGroup } from '../../framework/types'
import { buildGradientLUT, gradientIndex, trailFadeAlpha, toHex2 } from '../../framework/gradient'
import { parseHex6, mix, rgba } from '../../framework/color'
import { gravityWellsSchema, type GravityWellsConfig } from './schema'
import { motionPresets, colorPresets } from './presets'
import {
  createGravityState, maintainWells, advanceFieldTime, fieldAt,
  respawnParticle, outOfBounds, colorT, wellEnvelope,
  type GravityState,
} from './gravityWells'
import { meta } from './meta'

interface GWState extends GravityState { styles: string[]; gradientLUT: string[] }

function buildStyles(cfg: GravityWellsConfig): string[] {
  return cfg.color.colors.length ? cfg.color.colors : ['#ffffffff']
}

/** Gradient-mode colour LUT (empty in palette mode). wrap tracks the flow-angle
 *  source (cyclic); other sources are non-cyclic. Rebuilt on config change. */
function gradientLUTFor(cfg: GravityWellsConfig): string[] {
  return cfg.color.mode === 'gradient'
    ? buildGradientLUT(cfg.color.stops, cfg.color.source === 'flow-angle')
    : []
}

function assignColorIndices(state: GWState): void {
  const n = state.styles.length
  for (const p of state.particles) p.ci = Math.floor(state.rng() * n)
}

// Two independent preset axes. A Motion option patches the flow + well dynamics
// + trails; a Color option patches background + blend + the whole color group.
// Seed is excluded from both — the 🎲 dice stays independent of the chosen look.
const presets: PresetGroup<GravityWellsConfig>[] = [
  { label: 'Motion', options: motionPresets.map((p) => ({ name: p.name, patch: p.motion })) },
  {
    label: 'Palette',
    options: colorPresets.map((p) => ({
      name: p.name,
      patch: { background: p.background, blend: p.blend, color: p.color },
    })),
  },
]

const gravityWells = defineDiversion<typeof gravityWellsSchema, GWState, '2d'>({
  ...meta,
  schema: gravityWellsSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    const base = createGravityState(config, size.width, size.height)
    const state: GWState = { ...base, styles: buildStyles(config), gradientLUT: gradientLUTFor(config) }
    assignColorIndices(state)
    return state
  },

  update(state, config, size) {
    // structural changes (particle count, seed) → full re-setup
    if (config.particles !== state.cfg.particles || config.seed !== state.cfg.seed) return false
    // A palette-length change must re-spread the per-particle colour indices:
    // each particle's ci was drawn against the OLD palette length, so a newly
    // added colour (a larger index) is never referenced until we re-assign.
    const paletteLenChanged = config.color.colors.length !== state.cfg.color.colors.length
    state.cfg = config
    state.styles = buildStyles(config)
    state.gradientLUT = gradientLUTFor(config)
    state.w = size.width
    state.h = size.height
    if (paletteLenChanged) assignColorIndices(state)
    return true
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    // Setting canvas dims wipes the backing store; repaint the bg so the
    // newly-sized canvas doesn't flash the page colour before trails rebuild.
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
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
        ? state.gradientLUT[gradientIndex(colorT(cfg.color.source, p, Math.atan2(dy, dx), strength, w, h))]
        : styles[p.ci % styles.length]
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }

    // 4. well markers — a soft tonal halo, no edges: each attractor gently
    //    DARKENS the flow (a subtle sink). Low alpha + blurred radial falloff so
    //    it blends; a slow breath is the only motion, scaled by the well's
    //    current pull. Present if you look, invisible if you don't.
    ctx.globalCompositeOperation = 'source-over'
    const bg = parseHex6(cfg.background)
    const sink = mix(bg, { r: 0, g: 0, b: 0 }, 0.55) // darker than bg
    for (const wl of wells) {
      const env = wellEnvelope(wl)
      if (env <= 0.01) continue
      const breath = 0.5 + 0.5 * Math.sin(t / 2200 + (wl.x + wl.y) * 0.01) // ~14s, desynced
      const R = (30 + Math.min(2, wl.force) * 30) * (0.72 + 0.28 * breath)
      const alpha = env * 0.3 * (0.55 + 0.45 * breath)
      const grad = ctx.createRadialGradient(wl.x, wl.y, 0, wl.x, wl.y, R)
      grad.addColorStop(0, rgba(sink, alpha.toFixed(3)))
      grad.addColorStop(1, rgba(sink, 0))
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(wl.x, wl.y, R, 0, Math.PI * 2)
      ctx.fill()
    }
  },

  presets,
})

export default gravityWells
