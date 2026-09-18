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
  /** ⚠️ The LIVE canvas size, which is not the layer size after a resize.
   *  `frame()` once composited into `layers.width/height`, so `resize()`'s
   *  centred composite was overwritten on the very next frame (~8 ms) — the
   *  drawing snapped back to the top-left and the strip outside the old box kept
   *  a stale stretched ground that was never cleared again. `resize()` was
   *  effectively dead code, and nothing tested it. */
  viewW: number
  viewH: number
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

/** Below this a stroke stops reading as a line. Measured against the gallery
 *  tile, which is the smallest surface the piece appears on. */
const MIN_STROKE_PX = 0.9

/** The stroke width actually used, floored. Exported so the floor is testable
 *  without intercepting canvas calls — the stamps are drawn on the INK layer's
 *  own context, not the one handed to `frame`, so a proxy on the latter sees
 *  nothing. (It saw nothing, and the first version of the guard asserted on it.) */
export function strokeWidthFor(lineWidth: number, rmax: number): number {
  return Math.max(MIN_STROKE_PX, lineWidth * (rmax / 400))
}

/** Stamps per frame are hard-capped so a fast pen cannot make one frame
 *  unbounded work. */
const MAX_STAMPS = 1100

const stepFor = (comp: Composition) => Math.max(0.7, comp.Rmax * 0.004)

function build(ctx: CanvasRenderingContext2D, cfg: Config, size: Size): State {
  const { width, height } = size
  const comp = buildComposition(cfg, width, height, cfg.seed)
  // Recover dpr the shipped way (ablation/render.ts:149): the host sizes the
  // backing store and hands us CSS px, so this is the only way to see it.
  const dpr = Math.max(1, Math.min(4, ctx.canvas.width / size.width || 1))
  const layers = makeLayers(width, height, cfg.background, cfg.groundGrain, cfg.seed, dpr)
  return { cfg, comp, pen: newPen(), layers, heldMs: 0, done: false, viewW: width, viewH: height }
}

export default defineDiversion({
  ...meta,
  schema: kolamSchema,
  presets: kolamPresets,

  setup(ctx: CanvasRenderingContext2D, cfg: Config, size: Size): State {
    return build(ctx, cfg, size)
  },

  frame(state: State, ctx: CanvasRenderingContext2D, _t: number, dt: number) {
    const { comp, pen } = state
    if (!state.done) {
      const dist = comp.Rmax * PEN_RATE * state.cfg.penSpeed * (dt / 1000)
      const stamps = advance(pen, comp, dist, stepFor(comp), MAX_STAMPS, state.cfg.seed)
      // ⚠️ FLOOR THE STROKE. Width scales with Rmax so the piece looks the same
      // at every size — but a 337 px gallery tile has Rmax 142, which put the
      // line at 0.67 px at 0.46 alpha: the card read as a grey rectangle with a
      // ghost of an outline, the worst on the page, against UX invariant 1.
      // At tile scale a 6-stroke bundle spans 12 px, so the strokes SHOULD fuse
      // into one confident line — nothing can resolve six of them there. The
      // floor is what makes that line visible rather than a smudge.
      const w = strokeWidthFor(state.cfg.lineWidth, comp.Rmax)
      for (const s of stamps) drawStamp(state.layers.inkCtx, s, w, state.cfg.grain)
      if (pen.si >= comp.strokes.length) state.done = true
    } else {
      state.heldMs += dt
    }
    composite(ctx, state.layers, state.viewW, state.viewH)
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
      // ⚠️ `groundGrain` is STRUCTURAL despite costing nothing to re-derive.
      // It is a 0-60 slider and the ground rebuild measures ~225 ms, so a single
      // drag fired dozens of quarter-second synchronous stalls — the Salvage #319
      // shape, in the one place the plan flagged and did not measure.
      || a.groundGrain !== b.groundGrain
    if (structural) return false

    if (a.background !== b.background) {
      refreshGround(state.layers, b.background, b.groundGrain, b.seed,
                    state.viewW, state.viewH)
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
    state.viewW = size.width
    state.viewH = size.height
    // Repaint the ground to the NEW box so there is no stale strip outside the
    // old one; the ink keeps its own size and is composited centred.
    refreshGround(state.layers, state.cfg.background, state.cfg.groundGrain,
                  state.cfg.seed, size.width, size.height)
    composite(ctx, state.layers, size.width, size.height)
  },
})
