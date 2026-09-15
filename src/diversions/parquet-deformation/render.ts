import { buildTilePath, lerpCurve, paramAt, CURVE_POINTS, type Curve } from './curve'
import { hexToRgb } from '../../framework/color'
import { organicKeyframes, kneeIndex, ORGANIC_FAMILIES } from './organic'
import { gridKeyframes } from './grid'
import { ifsKeyframes, maxGenerations, IFS_RULES } from './ifs'
import type { ParquetConfig } from './schema'

/**
 * Baseline LUT resolution. The ACTUAL size is chosen per stack by `lutSizeFor`,
 * because a fixed count is what made the grid scheme pop.
 */
const LUT_MIN = 256
const LUT_MAX = 4096
/**
 * Target movement between adjacent LUT entries, in screen pixels at the
 * reference tile size. A tile's shape only changes when its ROUNDED LUT index
 * changes, so this IS the granularity of visible motion — below about half a
 * pixel it reads as gliding, and above ~2 px the eye catches discrete jumps.
 *
 * Measured at a fixed 256 entries: organic stepped 0.21 px and read as smooth,
 * while the grid presets stepped 2.7-4.9 px and read as "quick, sudden movement
 * all over" even after the phase rate was normalised. Slowing the phase makes
 * the jumps rarer; only more LUT resolution makes them smaller.
 */
const STEP_TARGET_PX = 0.4
/** The top of the `tileSize` slider — the worst case for visible step size. */
const MAX_TILE = 170

/** The generator runs to its maximum length ONCE. `detail` then selects how far
 *  along that stack the ramp reaches — so a Detail drag is a LUT rebuild (256
 *  lerps) and never a re-simulation. There is no debounce in the framework; a
 *  generator behind a slider would run on every pointermove. */
const MAX_STAGES = 48

export type ParquetState = {
  cfg: ParquetConfig
  stack: Curve[]
  lut: Curve[]
  /** Bumped whenever `lut` is replaced, and part of the cache key: the four
   *  indices a cached outline was built from mean nothing without the LUT they
   *  indexed. Without it a Detail drag rebuilds the LUT while every tile on
   *  screen hits the cache on its old key and redraws the pre-drag shape. */
  lutGen: number
  phase: number
  w: number
  h: number
  /** Outlines built during the last renderParquet. The cache exists to keep this
   *  near zero after the first frame; asserting on map SIZE instead measures a
   *  proxy that drifts for unrelated reasons. */
  builtThisFrame: number
  /** Flat point arrays in LOCAL tile space; the draw loop offsets them. Never a
   *  Path2D — jsdom has none and diversionSmoke sweeps every setup(). */
  outlines: Map<string, Float32Array>
  /** The previous frame's cache; see renderParquet. */
  prevOutlines: Map<string, Float32Array>
}

function generate(cfg: ParquetConfig): Curve[] {
  if (cfg.scheme === 'Organic') {
    const fam = ORGANIC_FAMILIES.find((f) => f.name === cfg.organicFamily) ?? ORGANIC_FAMILIES[1]
    return organicKeyframes(MAX_STAGES, fam.wobble, cfg.seed)
  }
  // ⚠️ No separate `gridVariant` field. There was one — four options named
  // "Seed 1".."Seed 4" — and it was a pure additive offset on `cfg.seed`, i.e. a
  // second seed sitting next to the real one, shown only under Grid keys, whose
  // named options could not name a look because `seed` re-rolls every visit.
  if (cfg.scheme === 'Grid keys') return gridKeyframes(MAX_STAGES, cfg.seed)
  const rule = IFS_RULES.find((r) => r.name === cfg.fractalRule) ?? IFS_RULES[0]
  return ifsKeyframes(rule.rule, maxGenerations(rule.rule))
}

/** WCAG relative luminance. `hexToRgb` returns 0..1 floats. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio, 1..21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Pick the colours a render mode actually needs, so no palette can produce an
 * unreadable screen.
 *
 * The palettes and `renderMode` are independent axes and only Fill + line was
 * authored against all six. Measured on the shipped set: in Line mode three
 * palettes put the stroke within 1.09:1 of the ground — the DEFAULT among them,
 * so one click from the default gave a black screen — and in Fill mode two put
 * the tiles within 1.22:1 of each other, i.e. no visible tiling at all.
 *
 * Invariants #1 (readability) and #5 (err toward more contrast) are not optional
 * on a reachable configuration, and no authored colour is moved here: the mode
 * simply reaches for whichever of the palette's own colours it needs.
 */
export function modeColors(cfg: ParquetConfig): { stroke: string; strokeAlways: boolean } {
  if (cfg.renderMode === 'Line') {
    // The ground is the background, and the only marks are strokes.
    const options = [cfg.line, cfg.tileA, cfg.tileB]
    let best = options[0]
    let bestRatio = contrast(best, cfg.background)
    for (const o of options.slice(1)) {
      const r = contrast(o, cfg.background)
      if (r > bestRatio) { best = o; bestRatio = r }
    }
    return { stroke: best, strokeAlways: true }
  }
  if (cfg.renderMode === 'Fill') {
    // Two fills and no stroke. If the fills do not separate, the tiling is
    // invisible — fall back to drawing the edge so the shapes still read.
    return { stroke: cfg.line, strokeAlways: contrast(cfg.tileA, cfg.tileB) < 1.5 }
  }
  return { stroke: cfg.line, strokeAlways: true }
}

/** Which fields require re-running the generator. Everything else is live. */
export function structural(a: ParquetConfig, b: ParquetConfig): boolean {
  return a.scheme !== b.scheme
    || a.organicFamily !== b.organicFamily
    || a.fractalRule !== b.fractalRule
    || a.seed !== b.seed
}

/**
 * Map `detail` onto the stack. Each scheme has its own natural end: the fractal
 * stack is only as deep as CURVE_POINTS can represent, the grid stack stops when
 * no legal push remains, and the organic stack saturates long before it stops
 * running. So the slider is scaled into whatever this stack actually offers
 * rather than indexing it directly — indexing directly made Detail inert under
 * the fractal scheme across all 43 of its positions.
 */
/** Point travel across the ramp, in tile units, sampled coarsely. Used to size
 *  the LUT before building it. */
function rampTravel(stack: Curve[], top: number): { total: number; worst: number; samples: number } {
  // ⚠️ Must out-sample the STAGES, not be a fixed count. Each sample interval
  // contributes its max point displacement, and over an interval spanning more
  // than one stage that is less than the sum of the parts — so a fixed 64
  // samples under-measured a 48-stage ramp by enough to under-size the LUT, and
  // 'Whole stack' at max detail still stepped 2.90 px while reporting fine.
  const SAMPLES = Math.max(128, Math.ceil(top) * 8)
  let total = 0
  let worst = 0
  let prev: Curve | null = null
  const last = stack.length - 1
  for (let i = 0; i <= SAMPLES; i++) {
    const x = (i / SAMPLES) * top
    const j = Math.min(Math.max(0, last - 1), Math.floor(x))
    const cur = last === 0 ? stack[0] : lerpCurve(stack[j], stack[j + 1], x - j)
    if (prev) {
      let mx = 0
      for (let q = 0; q < cur.length; q += 2) {
        const d = Math.hypot(cur[q] - prev[q], cur[q + 1] - prev[q + 1])
        if (d > mx) mx = d
      }
      total += mx
      if (mx > worst) worst = mx
    }
    prev = cur
  }
  return { total, worst, samples: SAMPLES }
}

export function buildLut(st: ParquetState, cfg: ParquetConfig): Curve[] {
  const stack = st.stack
  const last = stack.length - 1
  const ceiling = cfg.scheme === 'Organic' && cfg.rampMapping === 'To the knee'
    ? kneeIndex(stack)
    : last
  // Deliberately NOT rounded: buildLut interpolates a fractional `top` correctly,
  // and rounding would quantise Detail to `ceiling + 1` outcomes.
  const frac = (cfg.detail - 4) / (48 - 4)
  const top = Math.max(0.05, Math.min(ceiling, frac * ceiling))
  // Size the LUT so one step is about STEP_TARGET_PX, whatever this stack's
  // travel happens to be. Grid keys needs ~10x the entries organic does.
  // Size against the LARGEST tile the slider reaches, not a nominal one: the
  // step is in tile units, so a 170 px tile shows 1.55x the movement a 110 px
  // tile does, and sizing for 110 left the top of the slider popping.
  //
  // And size on the WORST interval as well as the total: travel is unevenly
  // distributed — organic 'Whole stack' concentrates it in a few transitions, so
  // a LUT sized by the average left those specific ones stepping 2.5 px while
  // every summary number looked fine.
  const t = rampTravel(stack, top)
  const byMean = (t.total * MAX_TILE) / STEP_TARGET_PX
  const byWorst = (t.worst * MAX_TILE * t.samples) / STEP_TARGET_PX
  const size = Math.round(Math.max(LUT_MIN, Math.min(LUT_MAX, Math.max(byMean, byWorst))))
  const lut: Curve[] = new Array(size)
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * top
    const j = Math.min(last - 1, Math.floor(x))
    lut[i] = last === 0 ? stack[0] : lerpCurve(stack[j], stack[j + 1], x - j)
  }
  return lut
}

/**
 * ⚠️ There was a `pace` multiplier here that scaled the phase rate by how far
 * the shape travels across the ramp, so Speed meant shape-change per second.
 * It is CUT, deliberately, and should not come back in that form:
 *
 * - It normalised the interpolation ARTEFACT, not the signal. Kaplan's §3
 *   evolves in discrete cell pushes, so interpolating adjacent grid stages
 *   slides points across the tile; that displacement is not shape change.
 *   Measured end to end, organic's edge becomes 3.68x more ornate across the
 *   catalogue and grid's 1.78x — so it damped the scheme that changes MOST.
 * - It took Labyrinth to a 17-minute traverse, missing the spec's own "arrives
 *   somewhere else within a minute" guardrail by 17x, unrecoverable from the
 *   Speed slider's maximum.
 * - It was derived from the generated stack, and `seed` is randomizeOnFreshLoad,
 *   so one URL at one Speed ran 850-1413 s depending on the visit.
 *
 * The jumpiness it was reaching for is real, and the adaptive LUT below is the
 * correct and sufficient fix for it: that makes each step sub-pixel, where `pace`
 * only made the steps rarer.
 */
/** The ONLY way `lut` is replaced. Bumping the generation is what invalidates
 *  the outline cache; assigning `st.lut` directly does not, and that is the
 *  defect this function exists to make unwriteable. */
export function setLut(st: ParquetState, lut: Curve[]): void {
  st.lut = lut
  st.lutGen++
}

export function rebuildStack(st: ParquetState, cfg: ParquetConfig): void {
  st.stack = generate(cfg)
  setLut(st, buildLut(st, cfg))
  st.outlines.clear()
  st.prevOutlines.clear()
}

export function createState(cfg: ParquetConfig, w: number, h: number): ParquetState {
  const st: ParquetState = {
    cfg, stack: [], lut: [], lutGen: 0, phase: 0, w, h, builtThisFrame: 0,
    outlines: new Map(), prevOutlines: new Map(),
  }
  rebuildStack(st, cfg)
  return st
}

/**
 * Quantise the parameter to a LUT index, coarsened for small tiles.
 *
 * The LUT is sized so a step is sub-pixel at the LARGEST tile the slider
 * reaches. At a smaller tile the same step spans proportionally fewer pixels, so
 * that resolution is invisible — and it is not free: the index IS the cache key,
 * so finer indices mean fewer tiles share an outline. Measured at tileSize 34,
 * full resolution rebuilt 54% of outlines every frame and cost p95 21.8 ms.
 * Snapping to every `q`-th entry restores the sharing exactly where the detail
 * cannot be seen, and leaves the largest tile at full resolution.
 */
const curveIdx = (t: number, size: number, q: number): number => {
  const raw = Math.round((t * (size - 1)) / q) * q
  return Math.max(0, Math.min(size - 1, raw))
}

export function renderParquet(st: ParquetState, ctx: CanvasRenderingContext2D): void {
  const cfg = st.cfg
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, st.w, st.h)

  const s = cfg.tileSize
  const cols = Math.ceil(st.w / s) + 2
  const rows = Math.ceil(st.h / s) + 2
  const cx = cols / 2
  const cy = rows / 2

  const mode = modeColors(cfg)
  ctx.lineWidth = cfg.lineWidth
  ctx.strokeStyle = mode.stroke
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // ⚠️ The cache MUST live across frames. An earlier draft cleared it every frame
  // on the theory that under Ramp the parameter depends on x alone, so a column
  // shares one outline. That is true at phase 0 and FALSE at every other phase:
  // the swing term tilts the axis, which is the whole point of it. Measured down
  // one column: 1 distinct index at phase 0, 5-6 at phases 0.5, 2.0 and 7.3.
  //
  // Two generations, not a cap-and-flush: a wholesale clear past a cap drops
  // every visible outline in one frame — a recurring stall the fps pill cannot
  // see. Swapping generations bounds the cache at ~2x the visible tiles with no
  // cliff. Measured at tileSize 34: 92.7 MB with a copy-forward cache, 10.4 MB
  // with this one.
  st.prevOutlines = st.outlines
  st.outlines = new Map()
  st.builtThisFrame = 0
  const pts: number[] = []
  const n = st.lut.length
  // floor, not round: `q * s` must never EXCEED MAX_TILE, or the tile steps
  // coarser than the basis the LUT was sized against — which round() did at the
  // default tile size of 110 (q=2 -> an effective 220).
  const q = Math.max(1, Math.floor(MAX_TILE / s))

  for (let j = -1; j < rows; j++) {
    for (let i = -1; i < cols; i++) {
      const b = curveIdx(paramAt(cfg.field, i + 0.5, j, cx, cy, cfg.rampWidth, st.phase), n, q)
      const r = curveIdx(paramAt(cfg.field, i + 1, j + 0.5, cx, cy, cfg.rampWidth, st.phase), n, q)
      const t = curveIdx(paramAt(cfg.field, i + 0.5, j + 1, cx, cy, cfg.rampWidth, st.phase), n, q)
      const l = curveIdx(paramAt(cfg.field, i, j + 0.5, cx, cy, cfg.rampWidth, st.phase), n, q)
      const key = `${b},${r},${t},${l},${st.lutGen}`
      let outline = st.outlines.get(key) ?? st.prevOutlines.get(key)
      if (outline) {
        st.outlines.set(key, outline) // promote, so it survives the next swap
      } else {
        pts.length = 0
        buildTilePath(pts, 0, 0, [st.lut[b], st.lut[r], st.lut[t], st.lut[l]], cfg.amplitude)
        outline = new Float32Array(pts.length)
        for (let p = 0; p < pts.length; p++) outline[p] = pts[p] * s
        st.outlines.set(key, outline)
        st.builtThisFrame++
      }
      const ox = i * s
      const oy = j * s
      ctx.beginPath()
      ctx.moveTo(ox + outline[0], oy + outline[1])
      for (let p = 1; p < CURVE_POINTS * 4; p++) {
        ctx.lineTo(ox + outline[p * 2], oy + outline[p * 2 + 1])
      }
      ctx.closePath()
      if (cfg.renderMode !== 'Line') {
        ctx.fillStyle = (i + j) & 1 ? cfg.tileA : cfg.tileB
        // NONZERO winding, explicitly. At high amplitude a tile's own edges can
        // overlap, and under 'evenodd' every doubly-wound pocket would punch a
        // background-coloured hole through the tile. Nonzero fills the union,
        // which is what an interlocking tile should look like. Stated rather than
        // left to the default, so a later reader knows it was considered.
        ctx.fill('nonzero')
      }
      if (mode.strokeAlways) ctx.stroke()
    }
  }
}
