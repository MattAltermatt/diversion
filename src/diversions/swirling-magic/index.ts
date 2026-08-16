// Swirling Magic — an homage to the After Dark "Rose"/"Satori" swirl modules
// (Berkeley Systems, 1989+; clean-room, credit Berkeley Systems). Luminous
// kaleidoscopic ribbons braid and unwind around a slowly-turning centre, colour
// oozing through a cyclic palette, ghost-trails smearing behind. Two generators:
// Vortex (flowing shear-swept ribbons) and Web (the faithful trig line-web
// mandala).
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { swirlingMagicSchema, type SwirlingMagicConfig } from './schema'
import {
  createSwirlState, renderSwirl, resizeSwirl, applyColors, type SwirlState,
} from './swirl'
import { stylePresets, palettePresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<SwirlingMagicConfig>[] = [
  { label: 'Style', options: stylePresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Palette', options: palettePresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const swirlingMagic = defineDiversion<typeof swirlingMagicSchema, SwirlState, '2d'>({
  ...meta,
  schema: swirlingMagicSchema,

  setup(ctx, config, size) {
    const st = createSwirlState(config, size.width, size.height)
    // Paint the ground once so the first frames fade against it, not transparent.
    ctx.globalCompositeOperation = 'source-over'
    renderSwirl(st, ctx, 0)
    return st
  },

  frame(state, ctx, _t, dt) {
    renderSwirl(state, ctx, dt / 1000)
  },

  resize(state, size) {
    resizeSwirl(state, size.width, size.height)
  },

  update(state, config) {
    // Generator, symmetry-arm mirroring aside, structural changes want a fresh
    // buffer: a new generator, a reseed, or a different ribbon count.
    if (config.generator !== state.cfg.generator) return false
    if (config.seed !== state.cfg.seed) return false
    if (config.generator === 'Vortex' && config.ribbons !== state.cfg.ribbons) return false
    // Breathe is baked into each ribbon's period at seed time (createSwirlState),
    // never read live — so a change must re-setup to reach existing ribbons (#270).
    if (config.breathe !== state.cfg.breathe) return false
    // Everything else reads live; a palette / background edit re-bakes the ramp.
    const recolor =
      config.palette.join() !== state.cfg.palette.join() ||
      config.background !== state.cfg.background
    state.cfg = config
    if (recolor) applyColors(state)
    return true
  },

  presets,
})

export default swirlingMagic
