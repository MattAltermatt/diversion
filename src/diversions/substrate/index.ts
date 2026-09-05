// Substrate — clean-room reimplementation of the algorithm from Jared
// Tarbell's "Substrate" (complexification.net/gallery/machines/substrate/).
// Reproduced from the published algorithm; not a code port. Original © Jared Tarbell.
import { defineDiversion } from '../../framework/types'
import { substrateSchema } from './schema'
import {
  createSubstrateState, stepSubstrate, updateSubstrateState, resizeSubstrateState,
  type SubstrateState,
} from './substrate'
import { meta } from './meta'
import { shapePresets, stylePresets } from './presets'

// The accreting painting lives in a CSS-px ImageData buffer. The main 2D context
// is DPR-scaled (setTransform(dpr)), and putImageData ignores that transform — so
// we blit through an offscreen canvas with drawImage, which honours it and upscales
// the CSS-px buffer to fill the whole canvas crisply. Cached per state, rebuilt on resize.
const offscreens = new WeakMap<SubstrateState, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number }>()
function getOffscreen(state: SubstrateState) {
  let off = offscreens.get(state)
  if (!off || off.w !== state.w || off.h !== state.h) {
    const canvas = document.createElement('canvas')
    canvas.width = state.w
    canvas.height = state.h
    off = { canvas, ctx: canvas.getContext('2d')!, w: state.w, h: state.h }
    offscreens.set(state, off)
  }
  return off
}

const substrate = defineDiversion<typeof substrateSchema, SubstrateState, '2d'>({
  ...meta,
  schema: substrateSchema,
  presets: [shapePresets, stylePresets],

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createSubstrateState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    const dirty = stepSubstrate(state, dt)
    // Skip the full-canvas putImageData + scaled drawImage when the buffer didn't
    // change this tick — at calm/low-speed defaults most frames run zero steps.
    // Always blit on a forced dt===0 repaint (post-resize/config/context-restore)
    // and on the first frame after setup/resize (forceBlit), when the canvas
    // backing store was cleared and must be repainted even with zero steps.
    if (dirty || dt === 0 || state.forceBlit) {
      const off = getOffscreen(state)
      off.ctx.putImageData(new ImageData(state.buf, state.w, state.h), 0, 0)
      ctx.drawImage(off.canvas, 0, 0, state.w, state.h)
      state.forceBlit = false
    }
  },

  resize(state, size) {
    resizeSubstrateState(state, size)
  },

  update(state, config, size) {
    return updateSubstrateState(state, config, size)
  },
})

export default substrate
