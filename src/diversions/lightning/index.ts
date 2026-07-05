import { defineDiversion, type PresetGroup } from '../../framework/types'
import { lightningSchema, type LightningConfig } from './schema'
import { advance, applyConfig, createState, type DBMState } from './dbm'
import { render } from './render'
import { formPresets, lookPresets } from './presets'

// Lightning grown by the dielectric breakdown model. The strike → flash → ember →
// respawn cycle is an internal state machine (see dbm.ts), so a single run loops
// forever — the right unattended screensaver behaviour, no framework reseed needed.

const presets: PresetGroup<LightningConfig>[] = [
  { label: 'Form', options: formPresets },
  { label: 'Look', options: lookPresets },
]

const lightning = defineDiversion<typeof lightningSchema, DBMState, '2d'>({
  id: 'lightning',
  title: 'Lightning',
  description: 'Branching bolts grown by the dielectric breakdown model — a leader crawls, flash-completes, fades to ember.',
  kind: '2d',
  schema: lightningSchema,

  setup(_ctx, config, size) {
    return createState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    // The field grid is pixel-bound; a resize rebuilds it (fullscreen toggle only).
    Object.assign(state, createState(state.cfg, size.width, size.height))
  },

  update(state, config) {
    return applyConfig(state, config)
  },

  presets,
})

export default lightning
