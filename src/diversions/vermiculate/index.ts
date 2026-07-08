// Vermiculate — clean-room reimplementation of the turtle-worm mechanic in
// xscreensaver's `vermiculate` (© 2001 Tyler Pierce, bundled into the
// xscreensaver hack collection curated by Jamie Zawinski,
// https://www.jwz.org/xscreensaver/). The original drives several turtles whose
// per-step turn amount itself accumulates a small random increment (its "spiral"
// mode), producing a self-similar meandering track; worms that trace back over
// themselves relocate, and the piece restarts once the whole plane fills. This
// port reimplements that mechanic from scratch (see turtle.ts / sim.ts) and
// upgrades the look to gallery grade: a warm bark-and-ivory palette that cycles
// along each track, soft bloom, and a persistent-buffer render so the tangle
// never decays.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { vermiculateSchema, type VermiculateConfig } from './schema'
import { advance, applyConfig, createState, shouldReseed, type VermiculateState } from './sim'
import { disposeVermiculateRender, renderVermiculate } from './render'
import { motionPresets, palettePresets } from './presets'

const presets: PresetGroup<VermiculateConfig>[] = [
  { label: 'Motion', options: motionPresets },
  { label: 'Palette', options: palettePresets },
]

const vermiculate = defineDiversion<typeof vermiculateSchema, VermiculateState, '2d'>({
  id: 'vermiculate',
  title: 'Vermiculate',
  description: 'Turtle worms crawl the plane, their turning rate drifting step by step, tracing a '
    + 'wormy tangle like the winding galleries worms leave under bark. After Jamie Zawinski and '
    + 'David Konerding’s Vermiculate (xscreensaver).',
  kind: '2d',
  schema: vermiculateSchema,
  presets,

  setup(_ctx, config, size) {
    return createState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    renderVermiculate(state, ctx)
  },

  resize(state, size) {
    // The occupancy grid + ink buffer are pixel-bound; a resize rebuilds the
    // world (fullscreen toggle only) — same tradeoff as dla.ts.
    disposeVermiculateRender(state)
    Object.assign(state, createState(state.cfg, size.width, size.height))
  },

  update(state, config) {
    return applyConfig(state, config)
  },

  shouldRestart(state) {
    return shouldReseed(state)
  },

  teardown(state) {
    disposeVermiculateRender(state)
  },
})

export default vermiculate
