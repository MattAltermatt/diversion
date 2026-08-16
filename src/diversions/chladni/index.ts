import { defineDiversion, type PresetGroup } from '../../framework/types'
import { toHex2 } from '../../framework/gradient'
import { chladniSchema, type ChladniConfig } from './schema'
import {
  createChladniState, stepGrains, updateChladniState, type ChladniState,
} from './chladni'
import { figurePresets, palettePresets } from './presets'
import { meta } from './meta'

// Two independent preset axes (mirrors Flow Field / Strange Attractors). Figure
// sets the mode; Palette recolors. Seed stays independent of both so the 🎲 dice
// still surprises with a fresh scatter + cycle order.
const presets: PresetGroup<ChladniConfig>[] = [
  { label: 'Figure', options: figurePresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Palette', options: palettePresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const chladni = defineDiversion<typeof chladniSchema, ChladniState, '2d'>({
  ...meta,
  schema: chladniSchema,

  setup(ctx, config, size) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createChladniState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    const { cfg, w, h } = state
    stepGrains(state, dt)

    // Clear the plate (crisp) or lay a low-alpha wash for a short migration trail.
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = cfg.afterglow > 0
      ? `${cfg.background}${toHex2(1 - cfg.afterglow)}`
      : cfg.background
    ctx.fillRect(0, 0, w, h)

    // Draw grains as tiny squares (no Path2D — jsdom lacks it). Unit-square coords
    // scale to the live canvas, so the figure is viewport-independent.
    ctx.fillStyle = cfg.grainColor
    const sz = cfg.grainSize
    const half = sz / 2
    const { xs, ys } = state
    for (let i = 0; i < xs.length; i++) {
      ctx.fillRect(xs[i] * w - half, ys[i] * h - half, sz, sz)
    }
  },

  resize(state, size, ctx) {
    // Geometry is unit-square (viewport-independent) — just track the new size and
    // repaint the plate so the resized canvas doesn't flash the page colour.
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    return updateChladniState(state, config)
  },

  presets,
})

export default chladni
