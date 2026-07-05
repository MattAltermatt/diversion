import { defineDiversion, type PresetGroup } from '../../framework/types'
import { paperMarblingSchema, type PaperMarblingConfig } from './schema'
import { generateSchedule } from './schedule'
import { dropRadiusAt, combPullAt, vortexStrengthAt, type Operation } from './ops'
import { initGL, render, packColors, disposeGL, MAX_OPS, type PaperMarblingGL } from './gl'
import { patternPresets, palettePresets } from './presets'

// Sheet cycle (base-ms, scaled by cfg.speed): construct the sheet, hold it a beat, dissolve
// to blank paper, then shouldRestart reseeds a fresh sheet (dla's hold→reseed idiom).
const HOLD_MS = 9000
const FADE_MS = 1800

type MarblingState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: PaperMarblingGL
  cfg: PaperMarblingConfig
  ops: Operation[]
  totalMs: number
  sheetMs: number
}

function rebuildSchedule(state: MarblingState): void {
  const { ops, totalMs } = generateSchedule(state.cfg)
  state.ops = ops
  state.totalMs = totalMs
}

// Write the operator rows into res.opData for the current sheet time. The newest op still in
// progress animates its completion scalar (drop radius / comb pull); earlier ops are frozen.
function packOps(state: MarblingState): number {
  const { ops, res, sheetMs } = state
  const data = res.opData
  let n = 0
  for (let i = 0; i < ops.length && n < MAX_OPS; i++) {
    const op = ops[i]
    if (sheetMs < op.startMs) break // future op — not on the sheet yet
    // Texture is width=MAX_OPS, height=2, row-major: ALL row-0 (A) texels, then ALL row-1
    // (B) texels. So op n's two texels are MAX_OPS*4 floats apart, NOT adjacent.
    const a = n * 4 // row 0 (A) texel for op n
    const b = (MAX_OPS + n) * 4 // row 1 (B) texel for op n
    if (op.kind === 'drop') {
      data[a] = 0 // type
      data[a + 1] = op.cx
      data[a + 2] = op.cy
      data[a + 3] = dropRadiusAt(op, sheetMs)
      data[b] = op.color
      data[b + 1] = 0
      data[b + 2] = 0
      data[b + 3] = 0
    } else if (op.kind === 'comb') {
      // offset folds anchor + phase: N ⟂ M, offset = A·N + phase (perp is invariant along M)
      const nx = -op.my
      const ny = op.mx
      const offset = op.ax * nx + op.ay * ny + op.phase
      data[a] = 1 // type
      data[a + 1] = op.mx
      data[a + 2] = op.my
      data[a + 3] = op.spacing
      data[b] = offset
      data[b + 1] = combPullAt(op, sheetMs)
      data[b + 2] = op.falloff
      data[b + 3] = 0
    } else {
      // vortex: rotate-back by −θ(r); strength ramps as the swirl winds on
      data[a] = 2 // type
      data[a + 1] = op.cx
      data[a + 2] = op.cy
      data[a + 3] = op.radius
      data[b] = vortexStrengthAt(op, sheetMs)
      data[b + 1] = 0
      data[b + 2] = 0
      data[b + 3] = 0
    }
    n++
  }
  return n
}

const presets: PresetGroup<PaperMarblingConfig>[] = [
  { label: 'Pattern', options: patternPresets },
  { label: 'Palette', options: palettePresets },
]

const paperMarbling = defineDiversion<typeof paperMarblingSchema, MarblingState, 'webgl'>({
  id: 'paper-marbling',
  title: 'Paper Marbling',
  description: 'Ebru & Suminagashi by exact closed-form maths — ink drops bloom, rakes comb them into peacock veins.',
  kind: 'webgl',
  schema: paperMarblingSchema,

  setup(gl, cfg, _size) {
    const { ops, totalMs } = generateSchedule(cfg)
    const res = initGL(gl)
    packColors(res, cfg.colors, cfg.background) // pack the palette once, off the hot path
    return { gl, res, cfg, ops, totalMs, sheetMs: 0 }
  },

  frame(state, gl, _t, dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    state.sheetMs += dt * state.cfg.speed

    const opCount = packOps(state)
    const holdEnd = state.totalMs + HOLD_MS
    const fade = Math.max(0, Math.min(1, (state.sheetMs - holdEnd) / FADE_MS))

    render(gl, state.res, opCount, fade, state.cfg.paperGrain)
  },

  update(state, cfg) {
    state.cfg = cfg
    // Always regenerate the (cheap, deterministic, linear) recipe: structural edits reshape it,
    // and pure-visual edits redraw it identically (same seed + count-independent draw order).
    // sheetMs is preserved so scrubbing a control never restarts the bloom.
    rebuildSchedule(state)
    packColors(state.res, cfg.colors, cfg.background) // repack palette on colour edits
    return true
  },

  shouldRestart(state) {
    return state.sheetMs >= state.totalMs + HOLD_MS + FADE_MS
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default paperMarbling
