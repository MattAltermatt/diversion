// Demon — clean-room reimplementation of xscreensaver's "demon": David
// Griffeath's cyclic cellular automaton. Faithful mechanic; gallery-grade
// presentation (three fields, an N-color hue-ring, adjustable dominance + threshold).
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { demonSchema, type DemonConfig } from './schema'
import {
  createDemonState, stepDemon, updateDemonState, resizeDemonState,
  reseedDemon, shouldReseedDemon, type DemonState,
} from './demon'
import { palettePresets, patternPresets } from './presets'
import { meta } from './meta'

const MAX_STEPS_PER_FRAME = 4

const presets: PresetGroup<DemonConfig>[] = [
  { label: 'Pattern', options: patternPresets },
  { label: 'Palette', options: palettePresets },
]

function paintAll(st: DemonState, ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = st.cfg.background
  ctx.fillRect(0, 0, st.w, st.h)
  for (let i = 0; i < st.cur.length; i++) st.tess.fillCell(ctx, i, st.lut[st.cur[i]])
  st.needsClear = false
}

const demon = defineDiversion<typeof demonSchema, DemonState, '2d'>({
  ...meta,
  schema: demonSchema,
  presets,

  setup(ctx, config, size) {
    const st = createDemonState(config, size.width, size.height)
    paintAll(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    if (state.needsClear) paintAll(state, ctx)
    state.acc += state.cfg.speed * (dt / 1000)
    let steps = Math.floor(state.acc)
    if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME // cap executed (post-stall)
    state.acc -= steps // carry the backlog so gen rate is frame-rate independent
    if (state.acc > MAX_STEPS_PER_FRAME) state.acc = MAX_STEPS_PER_FRAME
    for (let s = 0; s < steps; s++) {
      stepDemon(state)
      // Reseed lifecycle (#194): if the CA has frozen into an absorbing state, re-noise
      // with a folded seed and repaint — so no config can leave a permanent dead frame.
      if (shouldReseedDemon(state)) {
        reseedDemon(state)
        paintAll(state, ctx)
        continue
      }
      const { changed, tess, lut, cur } = state
      for (let c = 0; c < changed.length; c++) {
        const i = changed[c]
        tess.fillCell(ctx, i, lut[cur[i]])
      }
    }
  },

  resize(state, size) {
    resizeDemonState(state, size)
  },

  update(state, config, size) {
    return updateDemonState(state, config, size)
  },
})

export default demon
