import { defineDiversion } from '../../framework/types'
import { phantomTrafficSchema, type PhantomTrafficConfig } from './schema'
import { advance, buildLut, createTrafficState, render, type TrafficState } from './traffic'
import { phantomPresets } from './presets'

// Fields whose change reshapes the sim (rebuild lanes/cars) rather than just its
// look — a change to any of these falls back to a full re-setup.
const STRUCTURAL: (keyof PhantomTrafficConfig)[] = ['layout', 'lanes', 'roadLength', 'density', 'seed']

const phantomTraffic = defineDiversion<typeof phantomTrafficSchema, TrafficState, '2d'>({
  id: 'phantom-traffic',
  title: 'Phantom Traffic',
  description: 'Stop-and-go jams that nucleate from nothing and crawl backward against the flow.',
  kind: '2d',
  schema: phantomTrafficSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createTrafficState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    render(state, ctx)
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    state.painted = false
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    // Structural edits rebuild from scratch; everything else applies live.
    for (const k of STRUCTURAL) {
      if (config[k] !== state.cfg[k]) return false
    }
    state.cfg = config
    state.tickMs = 1000 / config.simSpeed
    state.lut = buildLut(config)
    return true
  },

  presets: phantomPresets,
})

export default phantomTraffic
