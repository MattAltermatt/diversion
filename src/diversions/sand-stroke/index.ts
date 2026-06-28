// Sand Stroke — clean-room reimplementation of the algorithm from Jared
// Tarbell's "Sand Stroke" (complexification.net/gallery/machines/sandstroke/).
// Reproduced from the published algorithm; not a code port. Original © Jared Tarbell.
import type { Diversion } from '../../framework/types'
import { sandStrokeSchema, type SandStrokeConfig } from './schema'
import {
  createSandState, stepSand, updateSandState, resizeSandState, type SandState,
} from './sandStroke'

// The accreting painting lives in a CSS-px ImageData buffer. The main 2D context
// is DPR-scaled (setTransform(dpr)), and putImageData ignores that transform — so
// we blit through an offscreen canvas with drawImage, which honours it and upscales
// the CSS-px buffer to fill the whole canvas crisply. Cached per state, rebuilt on resize.
const offscreens = new WeakMap<SandState, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number }>()
function getOffscreen(state: SandState) {
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

const sandStroke: Diversion<SandStrokeConfig, SandState, '2d'> = {
  id: 'sand-stroke',
  title: 'Sand Stroke',
  description: 'Grainy sand-painted colour ribbons that accrete across the canvas. '
    + 'After Jared Tarbell’s Sand Stroke (complexification.net).',
  kind: '2d',
  schema: sandStrokeSchema,

  setup(ctx, config, size) {
    // paint the ground once on the visible canvas so there's no first-frame flash
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createSandState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepSand(state, dt)
    const off = getOffscreen(state)
    off.ctx.putImageData(new ImageData(state.buf, state.w, state.h), 0, 0)
    // drawImage honours the ctx transform → CSS-px buffer upscales to fill the canvas
    ctx.drawImage(off.canvas, 0, 0, state.w, state.h)
  },

  resize(state, size) {
    resizeSandState(state, size)
  },

  update(state, config, size) {
    return updateSandState(state, config, size)
  },
}

export default sandStroke
