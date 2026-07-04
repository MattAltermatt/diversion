import { defineDiversion } from '../../framework/types'
import { braidSchema, type BraidConfig } from './schema'
import { buildBraid, type Braid } from './braid'
import { renderBraid } from './render'

// Lifecycle: the braid rotates continuously; after `holdSeconds` the framework
// rolls a fresh seed (shouldRestart) and re-weaves the ring with new colours and
// a new over/under parity — the endless screensaver loop, never interrupting the
// spin.
interface BraidState {
  cfg: BraidConfig
  w: number
  h: number
  braid: Braid
  rot: number // accumulated rotation (radians)
  elapsedMs: number // since the current braid was woven
}

const braid = defineDiversion<typeof braidSchema, BraidState, '2d'>({
  id: 'braid',
  title: 'Braid',
  description:
    'A glossy ring of coloured strands braiding over and under each other — a maypole plait bent into a '
    + 'torc, slowly rotating. The weave is a consistent braid-group interlace; a fresh braid is woven periodically.',
  kind: '2d',
  schema: braidSchema,

  setup(ctx, config, size) {
    const state: BraidState = {
      cfg: config,
      w: size.width,
      h: size.height,
      braid: buildBraid(config, size.width, size.height),
      rot: 0,
      elapsedMs: 0,
    }
    renderBraid(ctx, state.braid, state.w, state.h, state.rot)
    return state
  },

  frame(state, ctx, _t, dt) {
    state.rot += state.cfg.rotationSpeed * (dt / 1000)
    state.elapsedMs += dt
    renderBraid(ctx, state.braid, state.w, state.h, state.rot)
  },

  resize(state, size) {
    // Geometry is pixel-space; rebuild for the new size but keep the same seed
    // (colours/topology) and the live rotation — a rescale, not a reset.
    state.w = size.width
    state.h = size.height
    state.braid = buildBraid(state.cfg, size.width, size.height)
  },

  update(state, config) {
    // Rebuild is cheap (a few hundred points); do it on any edit so live tweaks
    // to strands/twist/radius/colours all apply. Rotation + timer carry over.
    state.cfg = config
    state.braid = buildBraid(config, state.w, state.h)
    return true
  },

  shouldRestart(state) {
    return state.elapsedMs >= state.cfg.holdSeconds * 1000
  },
})

export default braid
