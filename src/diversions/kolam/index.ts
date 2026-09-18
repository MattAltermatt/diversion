import { defineDiversion, type Size } from '../../framework/types'
import { meta } from './meta'
import { kolamSchema, type KolamSchemaConfig } from './schema'
import { kolamPresets } from './presets'
import { buildComposition, type Composition } from './composition'
import { advance, drawStamp, newPen, type PenState } from './powder'
import { composite, makeLayers, refreshGround, type Layers } from './render'

type Config = KolamSchemaConfig

interface State {
  cfg: Config
  comp: Composition
  pen: PenState
  layers: Layers
  /** Accumulated ms since the drawing finished; the hold before a reseed. */
  heldMs: number
  done: boolean
}

/** ⚠️ `dt` is MILLISECONDS, clamped at 50 by the framework loop. The probe's pen
 *  rate is expressed per SECOND, so the conversion is not optional: porting it
 *  unconverted runs the pen 1000x fast, and nothing catches that — pure tests
 *  drive the modules with literals and the smoke sweep only asserts a draw
 *  happened. Measured, the unconverted mutant reaches `drawn = 1102` in one
 *  frame where the correct value is 6. */
const PEN_RATE = 1.5

/** Stamps per frame are hard-capped so a fast pen cannot make one frame
 *  unbounded work. */
const MAX_STAMPS = 1100

const stepFor = (comp: Composition) => Math.max(0.7, comp.Rmax * 0.004)

function build(cfg: Config, size: Size): State {
  const { width, height } = size
  const comp = buildComposition(cfg, width, height, cfg.seed)
  const layers = makeLayers(width, height, cfg.background, cfg.groundGrain, cfg.seed)
  return { cfg, comp, pen: newPen(), layers, heldMs: 0, done: false }
}

export default defineDiversion({
  ...meta,
  schema: kolamSchema,
  presets: kolamPresets,

  setup(_ctx: CanvasRenderingContext2D, cfg: Config, size: Size): State {
    return build(cfg, size)
  },

  frame(state: State, ctx: CanvasRenderingContext2D, _t: number, dt: number) {
    const { comp, pen } = state
    if (!state.done) {
      const dist = comp.Rmax * PEN_RATE * state.cfg.penSpeed * (dt / 1000)
      const stamps = advance(pen, comp, dist, stepFor(comp), MAX_STAMPS, state.cfg.seed)
      const w = state.cfg.lineWidth * (comp.Rmax / 400)
      for (const s of stamps) drawStamp(state.layers.inkCtx, s, w, state.cfg.grain)
      if (pen.si >= comp.strokes.length) state.done = true
    } else {
      state.heldMs += dt
    }
    composite(ctx, state.layers, state.layers.width, state.layers.height)
  },

  /** ⚠️ Without this the piece redraws the IDENTICAL picture forever. The
   *  framework's reseed re-rolls every `randomizeOnFreshLoad` field — the seed —
   *  and re-runs `setup()`; a self-restart inside `frame()` would not. */
  shouldRestart(state: State) {
    return state.done && state.heldMs >= state.cfg.holdSeconds * 1000
  },

  /** ⚠️ The framework has NO debounce between a slider and `update()`, so every
   *  intermediate value of a drag lands here. Returning falsy re-runs `setup()`,
   *  which rebuilds the composition and the ground and restarts the drawing
   *  under the cursor — Salvage #319.
   *
   *  Only fields with no deposited state can apply live. Stroke colour is baked
   *  when the composition is built and powder is already rasterised into the ink
   *  layer, so every colour-bearing field is honestly structural: recolouring
   *  mid-draw leaves a drawing half one palette and half another, and it never
   *  heals. Same for lineWidth, grain and the bundle knobs. */
  update(state: State, cfg: Config) {
    const a = state.cfg, b = cfg
    const structural = a.seed !== b.seed
      || a.symmetry !== b.symmetry || a.registers !== b.registers || a.density !== b.density
      || a.strokesPerBundle !== b.strokesPerBundle || a.bundleSpacing !== b.bundleSpacing
      || a.lineWidth !== b.lineWidth || a.grain !== b.grain || a.handWobble !== b.handWobble
      || a.kaavi !== b.kaavi || a.kaaviColor !== b.kaaviColor
      || a.colouredChalk !== b.colouredChalk
      || a.palette.join() !== b.palette.join()
    if (structural) return false

    if (a.background !== b.background || a.groundGrain !== b.groundGrain) {
      refreshGround(state.layers, b.background, b.groundGrain, b.seed)
    }
    state.cfg = cfg
    return true
  },

  /** ⚠️ RE-COMPOSITE, do not rescale. A container reflow changes aspect ratio;
   *  an isotropic rescale by `min(W',H')/min(W,H)` is well-defined, but it would
   *  resample rasterised 2px streaks into a visible seam on a drawing that is
   *  then held, and pay a full rebuild per observer tick — `resize` is
   *  ResizeObserver-driven with no debounce. The drawing keeps the `Rmax` it was
   *  built with and is composited centred; a reseed re-derives it at the current
   *  size, so it self-heals within one cycle. */
  resize(state: State, size: Size, ctx: CanvasRenderingContext2D) {
    composite(ctx, state.layers, size.width, size.height)
  },
})
