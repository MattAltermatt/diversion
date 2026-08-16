import { defineDiversion, type Size } from '../../framework/types'
import { foragersSchema, type ForagersConfig } from './schema'
import { createArena, stepArena, type Arena } from './arena'
import { drawArena } from './render'
import { foragersPresets } from './presets'
import { meta } from './meta'

interface State { arena: Arena; cfg: ForagersConfig; size: Size }

// Population/pellet counts, brain shape, and the seed rebuild the world; the
// rest — physics tunables, evolution rates, colours, speed — applies live.
const STRUCTURAL: (keyof ForagersConfig)[] = ['creatureCount', 'foodCount', 'poisonCount', 'hiddenNeurons', 'sensorCount', 'seed']

const foragers = defineDiversion<typeof foragersSchema, State, '2d'>({
  ...meta,
  schema: foragersSchema,
  presets: foragersPresets,

  setup(_ctx, cfg, size) {
    return { arena: createArena(cfg, size.width, size.height), cfg, size }
  },

  frame(state, ctx, _t, dt) {
    // Advance sim time in capped substeps so a long frame (tab refocus) can't
    // teleport creatures through each other or past pellets.
    let simT = Math.min(dt, 100) / 1000 * state.cfg.speed
    while (simT > 0) {
      const s = Math.min(simT, 1 / 60)
      stepArena(state.arena, s)
      simT -= s
    }
    drawArena(ctx as CanvasRenderingContext2D, state.arena, state.cfg, state.size)
  },

  resize(state, size) {
    state.size = size // world is fixed; render recomputes the cover-fit
  },

  update(state, cfg, size) {
    for (const k of STRUCTURAL) {
      if (cfg[k] !== state.cfg[k]) return false
    }
    state.cfg = cfg
    state.arena.cfg = cfg
    state.size = size
    return true
  },

  teardown(state) {
    ;(state as unknown as { arena: null }).arena = null
  },
})

export default foragers
