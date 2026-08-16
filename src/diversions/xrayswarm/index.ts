// X-Ray Swarm — a clean-room take on Chris Leger's xscreensaver hack
// "xrayswarm" (2000; itself "a shameless ripoff of the 'swarm' screensaver on
// SGI boxes"). Several independent swarms each chase their own invisible,
// slowly-wandering leader; every agent leaves a smooth, glowing filament
// trail behind it, and the crossing trails weave into a luminous X-ray tangle.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { xraySwarmSchema, type XraySwarmConfig } from './schema'
import {
  createXraySwarmState, stepXraySwarm, drawXraySwarm, updateXraySwarmState,
  type XraySwarmState,
} from './xraySwarm'
import { palettePresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<XraySwarmConfig>[] = [
  { label: 'Palette', options: palettePresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const xraySwarm = defineDiversion<typeof xraySwarmSchema, XraySwarmState, '2d'>({
  ...meta,
  schema: xraySwarmSchema,

  setup(ctx, config, size) {
    const state = createXraySwarmState(config, size.width, size.height)
    drawXraySwarm(state, ctx)
    return state
  },

  frame(state, ctx, _t, dt) {
    stepXraySwarm(state, dt)
    drawXraySwarm(state, ctx)
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    return updateXraySwarmState(state, config)
  },

  presets,
})

export default xraySwarm
