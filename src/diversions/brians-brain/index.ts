// Brian's Brain & Wireworld — two 3/4-state excitable cellular automata by Brian
// Silverman, selected by the `rule` field. Brian's Brain streams endless diagonal
// spaceships; Wireworld flows electrons along wire circuits. Grid CA: stretched
// offscreen buffer + palette LUT + absolute-threshold reseed (like Life / demon).
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { briansBrainSchema, type BriansBrainConfig } from './schema'
import {
  createBrainState, stepBrain, renderBrain, resizeBrain, updateBrain, type BrainState,
} from './brain'
import { lookPresets } from './presets'

const MAX_STEPS_PER_FRAME = 4 // post-stall cap so a dt spike can't jank

const presets: PresetGroup<BriansBrainConfig>[] = [
  { label: 'Look', options: lookPresets },
]

const briansBrain = defineDiversion<typeof briansBrainSchema, BrainState, '2d'>({
  id: 'brians-brain',
  title: 'Brian’s Brain',
  description: 'Two excitable cellular automata by Brian Silverman. Brian’s Brain — cells wake, '
    + 'flash, and die by their neighbours, spawning endless diagonal spaceships that stream across '
    + 'a dark field and never settle. Switch rules for Wireworld, where electron heads and tails '
    + 'race along the conductive filaments that thread through the field.',
  kind: '2d',
  schema: briansBrainSchema,
  presets,

  setup(ctx, config, size) {
    const st = createBrainState(config, size.width, size.height)
    renderBrain(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.acc += state.cfg.speed * (dt / 1000)
    let steps = Math.floor(state.acc)
    state.acc -= steps
    if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME
    for (let s = 0; s < steps; s++) stepBrain(state)
    if (state.needBlit) renderBrain(state, ctx)
  },

  resize(state, size) {
    resizeBrain(state, size.width, size.height)
  },

  update(state, config) {
    return updateBrain(state, config)
  },
})

export default briansBrain
