import { defineDiversion, type PresetGroup } from '../../framework/types'
import { parquetSchema, type ParquetConfig } from './schema'
import {
  createState, rebuildStack, buildLut, setLut, structural, renderParquet, type ParquetState,
} from './render'
import { deformationPresets, palettePresets } from './presets'
import { meta } from './meta'

/**
 * Phase-units per second at drift 1. triWave has period 2, so at the default
 * drift of 10 a full traverse of the catalogue (Δφ = 1) takes 1 / (10 × 0.0021)
 * ≈ 48 s, and an exact loop absent the swing (Δφ = 2) would be 95 s.
 *
 * Owner direction was "slow it down a bit" against the mockup, whose default ran
 * a traverse in ~21 s. 48 s is 2.3× slower. An earlier draft picked 7.7× by
 * arithmetic error and called it settled; it is a tuning literal and it ships as
 * a default for the owner to move, not as a fact.
 */
const DRIFT_RATE = 0.0021

const presets: PresetGroup<ParquetConfig>[] = [
  { label: 'Deformation', options: deformationPresets },
  { label: 'Palette', options: palettePresets },
]

const parquetDeformation = defineDiversion<typeof parquetSchema, ParquetState, '2d'>({
  ...meta,
  schema: parquetSchema,
  presets,

  setup(ctx, config, size) {
    const st = createState(config, size.width, size.height)
    renderParquet(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.phase += state.cfg.drift * DRIFT_RATE * (dt / 1000)
    renderParquet(state, ctx)
  },

  resize(state, size) {
    // The tiling is defined per lattice cell, and Ramp/Diagonal pivot on a
    // lattice constant rather than the view centre, so a resize only changes how
    // many cells are drawn. No rebuild, no restart, and NO cache clear: an
    // outline is built in local tile space and depends on none of w/h/cx/cy, so
    // re-centring Radial changes which KEY a tile computes, never what a key
    // means. Clearing here cost one fully cold frame per ResizeObserver tick —
    // for every step of a window drag — and bought nothing.
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    if (structural(state.cfg, config)) {
      state.cfg = config
      rebuildStack(state, config)
    } else if (config.detail !== state.cfg.detail || config.rampMapping !== state.cfg.rampMapping) {
      // Only these two re-map the ramp onto the stack. The LUT is adaptive and
      // reaches 4096 curves, so rebuilding it for a colour picker or a tile-size
      // drag would be megabytes per pointermove — and there is no debounce
      // anywhere between a slider and here.
      state.cfg = config
      setLut(state, buildLut(state, config)) // bumps lutGen, invalidating the cache
    } else {
      // Amplitude and tile size are baked into the cached POINTS. They are
      // deliberately not in the key — 36 amplitude steps × ~2,100 tiles would
      // mint ~75,000 entries over one drag — so the cache is dropped instead.
      if (config.amplitude !== state.cfg.amplitude || config.tileSize !== state.cfg.tileSize) {
        state.outlines.clear()
        state.prevOutlines.clear()
      }
      state.cfg = config
    }
    return true
  },
})

export default parquetDeformation
