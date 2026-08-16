import { defineDiversion, type PresetGroup } from '../../framework/types'
import { asteroidsSchema, type AsteroidsConfig } from './schema'
import { createState, render, applyUpdate, type AsteroidsState } from './asteroids'
import { scenePresets, palettePresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<AsteroidsConfig>[] = [
  { label: 'Scene', options: scenePresets },
  { label: 'Palette', options: palettePresets },
]

const asteroids = defineDiversion<typeof asteroidsSchema, AsteroidsState, '2d'>({
  ...meta,
  schema: asteroidsSchema,
  presets,

  setup(ctx, config, size) {
    const st = createState(config, size.width, size.height)
    render(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.t += dt / 1000
    render(state, ctx)
  },

  // Viewport-independent: placement is scaled by height at draw time, and the
  // nebula/dust bakes are fixed-res + upscaled — so a resize only updates w/h.
  // Never re-bake or regenerate here (that would restart the drift).
  resize(state, size) {
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    applyUpdate(state, config)  // re-bakes / regenerates only when the relevant inputs change
    return true                  // light, camera, tumble, rim read live
  },
})

export default asteroids
