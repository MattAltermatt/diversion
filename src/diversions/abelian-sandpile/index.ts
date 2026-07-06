import { defineDiversion, type PresetGroup } from '../../framework/types'
import { abelianSandpileSchema, type AbelianSandpileConfig } from './schema'
import {
  createSandpileState, dumpPile, stepSandpile, renderOffscreen, blit, buildLUT,
  type SandpileState,
} from './sandpile'
import { arrangementPresets, colorPresets } from './presets'

const presets: PresetGroup<AbelianSandpileConfig>[] = [
  { label: 'Arrangement', options: arrangementPresets },
  { label: 'Palette', options: colorPresets },
]

const abelianSandpile = defineDiversion<typeof abelianSandpileSchema, SandpileState, '2d'>({
  id: 'abelian-sandpile',
  title: 'Abelian Sandpile',
  description: 'Grains of sand rain onto one point and topple whenever four pile up — the avalanche spreads into a self-similar fractal mandala that always settles the same way, no matter the order.',
  kind: '2d',
  schema: abelianSandpileSchema,
  presets,

  setup(ctx, config, size) {
    const st = createSandpileState(config, size.width, size.height)
    dumpPile(st) // seed the first growth cycle's pile onto the sources
    blit(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    stepSandpile(state, dt)
    if (state.dirtyCount > 0 || state.fullRepaint) {
      renderOffscreen(state) // push changed cells into the offscreen buffer
      blit(state, ctx)
      state.needBlit = false
    } else if (state.needBlit) {
      // nothing changed (e.g. the hold phase or right after a resize) — the canvas
      // persists last frame, so only re-blit when a resize asked for it.
      blit(state, ctx)
      state.needBlit = false
    }
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
    state.needBlit = true
  },

  update(state, config) {
    // Structural changes rebuild the grid / rearrange sources → full re-setup.
    if (config.detail !== state.cfg.detail) return false
    if (config.sources !== state.cfg.sources) return false
    if (config.seed !== state.cfg.seed) return false
    // speed / hold are read live each frame; a color change re-bakes the LUT and
    // forces one full repaint of the offscreen buffer.
    if (config.stops.join() !== state.cfg.stops.join()) {
      state.lut = buildLUT(config.stops)
      state.fullRepaint = true
    }
    state.cfg = config
    return true
  },
})

export default abelianSandpile
