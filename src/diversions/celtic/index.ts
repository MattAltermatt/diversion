import { defineDiversion, type PresetGroup } from '../../framework/types'
import { celticSchema, type CelticConfig } from './schema'
import { buildKnot, type KnotGeometry } from './knot'
import { renderKnot } from './render'
import { palettePresets } from './presets'

// Lifecycle: the knot blossoms out from the centre (GROW), rests (HOLD), fades
// (FADE), then `shouldRestart` asks the framework to roll a fresh seed and weave
// a new knot — the endless screensaver loop.
type Phase = 'grow' | 'hold' | 'fade'
const GROW_BASE_MS = 9000 // at traceSpeed 1; scaled by 1/traceSpeed
const FADE_MS = 2200

interface CelticState {
  cfg: CelticConfig
  w: number
  h: number
  geo: KnotGeometry
  phase: Phase
  growMs: number // elapsed grow time
  holdMs: number
  fadeMs: number
  finished: boolean
}

function rebuild(state: CelticState) {
  state.geo = buildKnot(state.cfg, state.w, state.h)
}

function resetLifecycle(state: CelticState) {
  state.phase = 'grow'
  state.growMs = 0
  state.holdMs = 0
  state.fadeMs = 0
  state.finished = false
}

const presets: PresetGroup<CelticConfig>[] = [{ label: 'Palette', options: palettePresets }]

const celtic = defineDiversion<typeof celticSchema, CelticState, '2d'>({
  id: 'celtic',
  title: 'Celtic',
  description:
    'Endless interlaced Celtic knotwork — smooth jewel-toned ribbons weave over and under in a single '
    + 'consistent plait, blossoming out from the centre, resting, then fading as a fresh knot is woven.',
  kind: '2d',
  schema: celticSchema,
  presets,

  setup(ctx, config, size) {
    const state: CelticState = {
      cfg: config,
      w: size.width,
      h: size.height,
      geo: buildKnot(config, size.width, size.height),
      phase: 'grow',
      growMs: 0,
      holdMs: 0,
      fadeMs: 0,
      finished: false,
    }
    renderKnot(ctx, state.geo, config, size.width, size.height, 0, 1)
    return state
  },

  frame(state, ctx, _t, dt) {
    const growDur = GROW_BASE_MS / state.cfg.traceSpeed
    let revealRadius = state.geo.maxRadius
    let alpha = 1

    if (state.phase === 'grow') {
      state.growMs += dt
      const p = Math.min(1, state.growMs / growDur)
      // ease-out so it settles gently into the full frame
      const eased = 1 - (1 - p) * (1 - p)
      revealRadius = eased * state.geo.maxRadius
      if (p >= 1) state.phase = 'hold'
    } else if (state.phase === 'hold') {
      state.holdMs += dt
      if (state.holdMs >= state.cfg.holdSeconds * 1000) state.phase = 'fade'
    } else {
      state.fadeMs += dt
      alpha = Math.max(0, 1 - state.fadeMs / FADE_MS)
      if (alpha <= 0) state.finished = true
    }

    renderKnot(ctx, state.geo, state.cfg, state.w, state.h, revealRadius, alpha)
  },

  resize(state, size) {
    // Geometry is pixel-space; recompute positions for the new size but keep the
    // same seed/topology and the current lifecycle phase (a rescale, not a reset).
    state.w = size.width
    state.h = size.height
    rebuild(state)
  },

  update(state, config) {
    const structural =
      config.gridSize !== state.cfg.gridSize ||
      config.wallDensity !== state.cfg.wallDensity ||
      config.seed !== state.cfg.seed
    state.cfg = config
    if (structural) {
      rebuild(state)
      resetLifecycle(state) // re-blossom the new topology in the live preview
    }
    return true // colours / widths / speed / hold read live
  },

  shouldRestart(state) {
    return state.finished
  },
})

export default celtic
