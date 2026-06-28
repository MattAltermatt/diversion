// Squiral — clean-room reimplementation of xscreensaver's "squiral" by Jeff
// Epler (1999). Faithful square-spiral mechanic; gallery-grade presentation.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { squiralSchema, type SquiralConfig } from './schema'
import {
  createSquiralState, stepSquiral, updateSquiralState, resizeSquiralState,
  parseHex6, type RGBA, type SquiralState,
} from './squiral'
import { mix, rgba } from '../../framework/color'
import { motionPresets, colorPresets } from './presets'

// A new cell fades in over this window instead of popping at full opacity, so
// the leading edge of each worm reads as a gentle bloom (#zen).
const BLOOM_MS = 220

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
    const bgRGBA = parseHex6(bg)
    if (state.phase === 'fading') {
      ctx.fillStyle = css(bgRGBA, state.fadeAlpha)
      ctx.fillRect(0, 0, state.w, state.h)
    }
    // recycled / wiped cells return to bg instantly
    for (const cell of state.expired) drawCell(ctx, cell.col, cell.row, bg, cs, gap, 'square')
    // A cell recycled this frame must cancel any in-flight bloom at that slot —
    // otherwise the bloom keeps repainting a bright cell over the now-empty (bg)
    // slot, and in rolling mode (no full clear) those strand as stuck specks.
    const recycled = state.expired.length
      ? new Set(state.expired.map((c) => c.row * state.cols + c.col))
      : null
    // newly-filled cells enter the bloom list instead of popping at full opacity
    for (const cell of state.dirty) state.appearing.push({ col: cell.col, row: cell.row, c: cell.c, age: 0 })
    state.dirty.length = 0
    state.expired.length = 0
    // age + redraw each blooming cell, lerping its colour bg→target (smoothstep);
    // settled cells are drawn once at full colour and drop out of the list.
    const style = state.cfg.cellStyle
    let live = 0
    for (const a of state.appearing) {
      if (recycled?.has(a.row * state.cols + a.col)) continue // recycled → bloom canceled
      a.age += dt
      const t = Math.min(1, a.age / BLOOM_MS)
      const s = t * t * (3 - 2 * t) // smoothstep ease
      drawCell(ctx, a.col, a.row, rgba(mix(bgRGBA, a.c, s), 1), cs, gap, style)
      if (a.age < BLOOM_MS) state.appearing[live++] = a // compact in place; keep the unsettled
    }
    state.appearing.length = live
  },

  resize(state, size) {
    resizeSquiralState(state, size)
  },

  update(state, config, size) {
    return updateSquiralState(state, config, size)
  },
})

export default squiral
