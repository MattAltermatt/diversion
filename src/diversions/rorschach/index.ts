import { defineDiversion, type PresetGroup } from '../../framework/types'
import { rorschachSchema, type RorschachConfig } from './schema'
import { advance, applyConfig, createState, type RorschachState } from './rorschach'
import { render, disposeRender } from './render'
import { formPresets, inkPresets } from './presets'

const presets: PresetGroup<RorschachConfig>[] = [
  { label: 'Form', options: formPresets },
  { label: 'Ink', options: inkPresets },
]

const rorschach = defineDiversion<typeof rorschachSchema, RorschachState, '2d'>({
  id: 'rorschach',
  title: 'Rorschach',
  description: 'A symmetric inkblot blooms, holds, and dissolves — an endless, mirror-perfect Rorschach card.',
  kind: '2d',
  schema: rorschachSchema,

  setup(_ctx, config, size) {
    return createState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    // The blot geometry is sized to the viewport; a resize (fullscreen toggle) rebuilds
    // it. The accumulation buffer is pixel-bound, so it's freed and re-made too.
    disposeRender(state)
    Object.assign(state, createState(state.cfg, size.width, size.height))
  },

  update(state, config) {
    return applyConfig(state, config)
  },

  teardown(state) {
    disposeRender(state)
  },

  presets,
})

export default rorschach
