// Slime Aggregation — Dictyostelium (cellular slime mold) aggregation (#173).
// Starving amoebae relay a cAMP chemical wave across an excitable field
// (spiral + target waves radiating from a few self-firing pacemakers), and
// stream chemotactically inward along the wave gradients — pulsatile
// streaming, the classic Dictyostelium behavior — into branching rivers that
// converge on aggregation centers. Once a mound has held together for a beat
// (or a max run time elapses), the dish reseeds. Distinct from Physarum (a
// continuous slime transport network, no wave field) and Excitable Media (the
// bare BZ field alone, no chemotactic agent layer) — the headline here is the
// agent streaming layer coupled to the wave field.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { slimeAggregationSchema, type SlimeAggregationConfig } from './schema'
import {
  createSlimeState, advance, updateSlimeState, resizeSlimeState, shouldRestartSlime,
  type SlimeAggregationState,
} from './slimeAggregation'
import { renderField } from './render'
import { patternPresets, colorPresets } from './presets'

const presets: PresetGroup<SlimeAggregationConfig>[] = [
  { label: 'Pattern', options: patternPresets },
  { label: 'Palette', options: colorPresets },
]

const slimeAggregation = defineDiversion<typeof slimeAggregationSchema, SlimeAggregationState, '2d'>({
  id: 'slime-aggregation',
  title: 'Slime Aggregation',
  description: 'Starving amoebae relay a rotating cAMP wave and stream chemotactically along it, branching into rivers that converge into a body — the Dictyostelium slime mold aggregation.',
  kind: '2d',
  schema: slimeAggregationSchema,
  presets,

  setup(_ctx, config, size) {
    return createSlimeState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    renderField(state, ctx)
  },

  resize(state, size) {
    resizeSlimeState(state, size)
  },

  update(state, config) {
    return updateSlimeState(state, config)
  },

  shouldRestart(state, t, dt) {
    return shouldRestartSlime(state, t, dt)
  },
})

export default slimeAggregation
