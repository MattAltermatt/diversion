// Hexadrop (#100) — raindrops on a hex pond. Drops land at random cells and send
// concentric ripples across the lattice (measured in hex-ring distance); each ring
// brightens, recolours and swells the hexes its front passes, and overlapping rings
// interfere into shifting patterns. The framework owns the rAF loop; this draws one
// frame. Simulation logic lives in ripples.ts / hexgrid.ts (pure, unit-tested).
import { defineDiversion } from '../../framework/types'
import { rgba } from '../../framework/color'
import { hexadropSchema } from './schema'
import {
  createState, stepRipples, updateState, resizeState, cellColor,
  type HexadropState,
} from './ripples'

const SCALE_BOOST = 0.24 // how much a fully-lit hex swells (fraction of its radius)
const MIN_LIT = 0.012 // below this a cell is treated as still water (no fill)

/** Stroke the resting hex mesh as one batched path (single stroke call). */
function drawMesh(state: HexadropState, ctx: CanvasRenderingContext2D): void {
  const { cells, cornerOff, cfg } = state
  if (cfg.gridOpacity <= 0) return
  ctx.beginPath()
  for (let i = 0; i < cells.length; i++) {
    const { cx, cy } = cells[i]
    ctx.moveTo(cx + cornerOff[0], cy + cornerOff[1])
    for (let k = 1; k < 6; k++) ctx.lineTo(cx + cornerOff[k * 2], cy + cornerOff[k * 2 + 1])
    ctx.closePath()
  }
  ctx.lineWidth = 1
  ctx.strokeStyle = rgba({ r: 150, g: 170, b: 200 }, cfg.gridOpacity)
  ctx.stroke()
}

/** Fill one hex at the given centre, scaled about its centre by `scale`. */
function fillHex(
  ctx: CanvasRenderingContext2D, cornerOff: number[], cx: number, cy: number, scale: number,
): void {
  ctx.beginPath()
  ctx.moveTo(cx + cornerOff[0] * scale, cy + cornerOff[1] * scale)
  for (let k = 1; k < 6; k++) {
    ctx.lineTo(cx + cornerOff[k * 2] * scale, cy + cornerOff[k * 2 + 1] * scale)
  }
  ctx.closePath()
  ctx.fill()
}

function render(state: HexadropState, ctx: CanvasRenderingContext2D): void {
  const { cells, cornerOff, intensity, cfg } = state
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, state.w, state.h)
  drawMesh(state, ctx)

  for (let i = 0; i < cells.length; i++) {
    const raw = intensity[i]
    if (raw <= 0) continue
    const I = 1 - Math.exp(-raw) // soft-clamp overlaps into 0..1 (never blows out)
    if (I < MIN_LIT) continue
    const c = cellColor(state, i, I)
    ctx.fillStyle = rgba(c, 1)
    fillHex(ctx, cornerOff, cells[i].cx, cells[i].cy, 1 + I * SCALE_BOOST)
  }
}

const hexadrop = defineDiversion<typeof hexadropSchema, HexadropState, '2d'>({
  id: 'hexadrop',
  title: 'Hexadrop',
  description: 'Raindrops on a hex pond: drops land at random cells and send concentric '
    + 'ripples across the lattice, brightening and recolouring each ring of hexes they pass. '
    + 'Overlapping ripples interfere into slow, shifting patterns.',
  kind: '2d',
  schema: hexadropSchema,

  setup(ctx, config, size) {
    const st = createState(config, size.width, size.height)
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return st
  },

  frame(state, ctx, _t, dt) {
    stepRipples(state, dt)
    render(state, ctx)
  },

  resize(state, size, ctx) {
    resizeState(state, size.width, size.height)
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    return updateState(state, config)
  },
})

export default hexadrop
