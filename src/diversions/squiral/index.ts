// Squiral — clean-room reimplementation of xscreensaver's "squiral" by Jeff
// Epler (1999). Faithful square-spiral mechanic; gallery-grade presentation.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { squiralSchema, type SquiralConfig } from './schema'
import {
  createSquiralState, stepSquiral, updateSquiralState, resizeSquiralState,
  parseHex6, type RGBA, type SquiralState,
} from './squiral'
import { motionPresets, colorPresets } from './presets'

function css(c: RGBA, a = c.a): string {
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`
}

function drawCell(
  ctx: CanvasRenderingContext2D, col: number, row: number, fill: string,
  cs: number, gap: number, style: 'square' | 'ribbon',
): void {
  const x = col * cs, y = row * cs
  ctx.fillStyle = fill
  if (style === 'ribbon') {
    const r = cs / 2
    ctx.beginPath()
    ctx.arc(x + r, y + r, Math.max(0.5, r - gap * 0.5), 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillRect(x + gap * 0.5, y + gap * 0.5, cs - gap, cs - gap)
  }
}

const presets: PresetGroup<SquiralConfig>[] = [
  { label: 'Motion', options: motionPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Color', options: colorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const squiral = defineDiversion<typeof squiralSchema, SquiralState, '2d'>({
  id: 'squiral',
  title: 'Squiral',
  description: 'Worms crawl a grid, each winding itself into a tight square spiral until boxed in, '
    + 'flooding the screen with interlocking right-angled coils. After Jeff Epler’s Squiral (xscreensaver).',
  kind: '2d',
  schema: squiralSchema,
  presets,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createSquiralState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    if (state.needsClear) {
      ctx.fillStyle = state.cfg.background
      ctx.fillRect(0, 0, state.w, state.h)
      state.needsClear = false
    }
    stepSquiral(state, dt)
    const cs = state.cfg.cellSize, gap = state.cfg.gap
    const bg = state.cfg.background
    if (state.phase === 'fading') {
      ctx.fillStyle = css(parseHex6(bg), state.fadeAlpha)
      ctx.fillRect(0, 0, state.w, state.h)
    }
    for (const cell of state.expired) drawCell(ctx, cell.col, cell.row, bg, cs, gap, 'square')
    for (const cell of state.dirty) drawCell(ctx, cell.col, cell.row, css(cell.c), cs, gap, state.cfg.cellStyle)
    state.dirty.length = 0
    state.expired.length = 0
  },

  resize(state, size) {
    resizeSquiralState(state, size)
  },

  update(state, config, size) {
    return updateSquiralState(state, config, size)
  },
})

export default squiral
