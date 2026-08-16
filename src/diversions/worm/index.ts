// Worm — a clean-room take on xscreensaver's "worm" by (originally) the
// xscreensaver hacks collection. Several worms crawl across the screen on smooth
// curving paths — a slow random walk in heading gives gentle S-curves, never
// sharp corners — each dragging a fixed-length, tapered, glossy body behind a
// rounded head. Calm, hypnotic, always beautiful.
import { defineDiversion } from '../../framework/types'
import { wormSchema } from './schema'
import {
  createWormState, stepWorms, drawWorms, updateWormState, type WormState,
} from './worm'
import { meta } from './meta'

const worm = defineDiversion<typeof wormSchema, WormState, '2d'>({
  ...meta,
  schema: wormSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createWormState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepWorms(state, dt)
    drawWorms(state, ctx)
  },

  resize(state, size) {
    // Worlds are screen-space; don't regenerate the worms (a ResizeObserver fires
    // on every fullscreen/drag — regenerating would restart the sim). Just adopt
    // the new bounds and repaint the background (the backing store was wiped).
    state.w = size.width
    state.h = size.height
    state.needsClear = true
  },

  update(state, config, size) {
    void size
    return updateWormState(state, config)
  },
})

export default worm
