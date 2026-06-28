// Substrate — clean-room reimplementation of the algorithm from Jared
// Tarbell's "Substrate" (complexification.net/gallery/machines/substrate/).
// Reproduced from the published algorithm; not a code port. Original © Jared Tarbell.
import { defineDiversion } from '../../framework/types'
import { substrateSchema } from './schema'
import {
  createSubstrateState, stepSubstrate, updateSubstrateState, resizeSubstrateState,
  type SubstrateState,
} from './substrate'

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
  id: 'substrate',
  title: 'Substrate',
  description: 'Cracks grow and branch at right angles into an organic network, '
    + 'each washing a soft watercolour cell beside it. After Jared Tarbell’s Substrate (complexification.net).',
  kind: '2d',
  schema: substrateSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createSubstrateState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepSubstrate(state, dt)
    const off = getOffscreen(state)
    off.ctx.putImageData(new ImageData(state.buf, state.w, state.h), 0, 0)
    ctx.drawImage(off.canvas, 0, 0, state.w, state.h)
  },

  resize(state, size) {
    resizeSubstrateState(state, size)
  },

  update(state, config, size) {
    return updateSubstrateState(state, config, size)
  },
})

export default substrate
