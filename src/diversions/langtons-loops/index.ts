// Langton's Loops — clean-room port of xscreensaver's `loop` by David Bagley,
// implementing Christopher Langton's self-reproducing loops (1984). Faithful
// 8-state / von-Neumann / rotate4 mechanic; gallery-grade presentation
// (sheath + signal-hue-ring palette, aged coral, breathing reseed lifecycle).
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { langtonsLoopsSchema, type LangtonsLoopsConfig } from './schema'
import { buildStateLut, AGE_BUCKETS, type StateLut } from './palette'
import { palettePresets } from './presets'
import {
  createLoopsState, stepLoops, tickLifecycle, fadeAlpha,
  updateLoopsState, resizeLoopsState, type LoopsState,
} from './loops'

const MAX_STEPS_PER_FRAME = 4
const AGE_PASS_HZ = 2                 // throttle the aged-coral repaint
const AGE_BUCKET_STEPS = 24           // CA steps per age bucket (~3s/bucket at 8/s)

interface RenderState extends LoopsState {
  lut: StateLut
  ageAcc: number                      // seconds since last age pass
  bucketOf: Uint8Array                // last-painted age bucket per cell
}

const presets: PresetGroup<LangtonsLoopsConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

function ageBucket(rs: RenderState, i: number): number {
  const age = rs.step - rs.bornStep[i]
  return Math.min(AGE_BUCKETS - 1, Math.max(0, Math.floor(age / AGE_BUCKET_STEPS)))
}

function cellColor(rs: RenderState, i: number): string {
  const s = rs.cur[i]
  if (s === 2) return rs.lut.agedSheath[ageBucket(rs, i)]
  return rs.lut[s]
}

function paintCell(rs: RenderState, ctx: CanvasRenderingContext2D, i: number): void {
  const cs = rs.cfg.cellSize
  const x = (i % rs.cols) * cs, y = Math.floor(i / rs.cols) * cs
  ctx.fillStyle = cellColor(rs, i)
  ctx.fillRect(x, y, cs, cs)
}

function paintAll(rs: RenderState, ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = rs.cfg.background
  ctx.fillRect(0, 0, rs.w, rs.h)
  for (let i = 0; i < rs.cur.length; i++) {
    if (rs.cur[i] !== 0) paintCell(rs, ctx, i)
    rs.bucketOf[i] = ageBucket(rs, i)
  }
  rs.needsClear = false
}

const langtonsLoops = defineDiversion<typeof langtonsLoopsSchema, RenderState, '2d'>({
  id: 'langtons-loops',
  title: "Langton's Loops",
  description:
    'Christopher Langton’s self-reproducing loops (1984): a looped organism extends a '
    + 'construction arm and buds off copies, colonising the plane. After xscreensaver’s '
    + '“loop” by David Bagley.',
  kind: '2d',
  schema: langtonsLoopsSchema,
  presets,

  setup(ctx, config, size) {
    const base = createLoopsState(config, size.width, size.height)
    const rs: RenderState = Object.assign(base, {
      lut: buildStateLut(config), ageAcc: 0,
      bucketOf: new Uint8Array(base.cur.length),
    })
    paintAll(rs, ctx)
    return rs
  },

  frame(rs, ctx, _t, dt) {
    const dts = dt / 1000
    // Defer a live color-edit repaint while fading: paintAll would redraw cells at
    // full brightness and lose the compounded fade overlay for one frame (a visible
    // pop). needsClear stays set, so the edit lands on the next reseed instead.
    if (rs.needsClear && rs.phase !== 'fade') { rs.lut = buildStateLut(rs.cfg); paintAll(rs, ctx) }

    // advance CA steps (capped)
    rs.acc += rs.cfg.speed * dts
    let steps = Math.floor(rs.acc); rs.acc -= steps
    if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME
    for (let s = 0; s < steps; s++) {
      stepLoops(rs)
      for (let c = 0; c < rs.changed.length; c++) paintCell(rs, ctx, rs.changed[c])
    }

    // throttled aged-coral pass: re-dim inert sheath cells whose bucket advanced.
    // Only meaningful while 'running' — during hold/fade rs.step is frozen (stepLoops
    // no-ops), so every cell's bucket is already up to date and the full-grid scan
    // would be a guaranteed no-op; skip it and just hold the accumulator at 0.
    rs.ageAcc += dts
    if (rs.phase !== 'running') {
      rs.ageAcc = 0
    } else if (rs.ageAcc >= 1 / AGE_PASS_HZ) {
      rs.ageAcc = 0
      for (let i = 0; i < rs.cur.length; i++) {
        if (rs.cur[i] !== 2) continue
        const bucket = ageBucket(rs, i)
        if (bucket !== rs.bucketOf[i]) { rs.bucketOf[i] = bucket; paintCell(rs, ctx, i) }
      }
    }

    // lifecycle: hold -> fade (overlay) -> reseed
    tickLifecycle(rs, dts)
    const a = fadeAlpha(rs)
    if (a > 0) {
      ctx.fillStyle = rs.cfg.background
      ctx.globalAlpha = Math.min(1, a)
      ctx.fillRect(0, 0, rs.w, rs.h)
      ctx.globalAlpha = 1
    }
  },

  resize(rs, size) {
    resizeLoopsState(rs, size)
    rs.lut = buildStateLut(rs.cfg)
    rs.bucketOf = new Uint8Array(rs.cur.length)
    rs.ageAcc = 0
    rs.needsClear = true
  },

  update(rs, config, size) {
    // Don't rebuild the LUT here: updateLoopsState sets rs.cfg = config AND
    // needsClear = true, so frame()'s existing needsClear branch rebuilds the LUT
    // (from the now-current rs.cfg) + repaints on the very next frame — building it
    // here too just throws away an identical, immediately-discarded LUT.
    return updateLoopsState(rs, config, size)
  },
})

export default langtonsLoops
