// Fuzzyflakes — a calm field of soft, plush, radially-symmetric snowflakes
// drifting and slowly rotating across a deep field. A clean-room, decorative take
// on xscreensaver's `fuzzyflakes` (distinct from the gallery's `reiter-snowflake`,
// which is a Reiter growth CA). Credit: jwz/xscreensaver.
import { defineDiversion, type Size } from '../../framework/types'
import { fuzzyflakesSchema, type FuzzyflakesConfig } from './schema'
import { createFlakes, stepFlakes, drawScene, type Flake } from './fuzzyflakes'
import { meta } from './meta'

type FuzzyflakesState = {
  cfg: FuzzyflakesConfig
  flakes: Flake[]
  w: number
  h: number
}

const fuzzyflakes = defineDiversion<typeof fuzzyflakesSchema, FuzzyflakesState, '2d'>({
  ...meta,
  schema: fuzzyflakesSchema,

  setup(ctx, cfg, size: Size) {
    const st: FuzzyflakesState = {
      cfg,
      flakes: createFlakes(cfg, size.width, size.height),
      w: size.width,
      h: size.height,
    }
    drawScene(ctx, st.flakes, st.cfg, st.w, st.h)
    return st
  },

  frame(state, ctx, _t, dt) {
    stepFlakes(state.flakes, state.cfg, state.w, state.h, dt)
    drawScene(ctx, state.flakes, state.cfg, state.w, state.h)
  },

  resize(state, size) {
    // Viewport-independent field: keep the flakes, just rescale their positions so
    // they don't clump at one edge, and let stepFlakes wrap them to the new bounds.
    if (state.w > 0 && state.h > 0) {
      const sx = size.width / state.w
      const sy = size.height / state.h
      for (const f of state.flakes) {
        f.x *= sx
        f.y *= sy
      }
    }
    state.w = size.width
    state.h = size.height
  },

  update(state, cfg, size) {
    // Structural fields → rebuild the field; everything else reads live at draw time
    // (arms, armStyle, driftSpeed, rotateSpeed, fuzziness, palette, background).
    const restructure = cfg.seed !== state.cfg.seed
      || cfg.flakeCount !== state.cfg.flakeCount
      || cfg.sizeMin !== state.cfg.sizeMin
      || cfg.sizeMax !== state.cfg.sizeMax
    state.cfg = cfg
    if (restructure) state.flakes = createFlakes(cfg, size.width, size.height)
    return true
  },
})

export default fuzzyflakes
