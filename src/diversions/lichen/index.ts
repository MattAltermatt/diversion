import { defineDiversion } from '../../framework/types'
import { computeSterile, computeWet } from './rock'
import { buildPalette, paint, type Palette } from './render'
import { lichenSchema, type LichenConfig } from './schema'
import { createWorld, stepWorld, type World } from './world'
import { meta } from './meta'

interface LichenState {
  world: World
  cfg: LichenConfig
  pal: Palette
  /** Offscreen cell grid, blitted up to the canvas. Allocated once — with a fixed cell
   *  count it never changes size, so a resize must not reallocate it. */
  buf: OffscreenCanvas | HTMLCanvasElement
  img: ImageData
  bctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
  /** CSS pixels. `frame` is handed no size, so it has to be carried on state. */
  w: number
  h: number
}

/** Cells are a fixed size in CSS pixels and the COUNT varies with the window — square
 *  cells, canvas always filled, never letterboxed.
 *
 *  Deriving the cell from a nominal cell COUNT instead (the first version of this, and
 *  what `salvage` does for its own reasons) makes a large window coarse: at 1512 CSS px
 *  wide a 250-column arena gives 6 px cells, against the ~2 px the approved look was
 *  tuned at, and the thalli come out blocky. A varying cell count is only safe because
 *  founding AND priming are per-area; with either of them per-run this would drift. */
const TARGET_CELL_CSS = 2.4
/** Frame-budget ceiling. Beyond this the cell grows instead, so a 5K display costs no
 *  more per frame than a large laptop one. */
const MAX_CELLS = 260_000

function gridFor(w: number, h: number): { cols: number; rows: number } {
  let cell = TARGET_CELL_CSS
  const wanted = (w / cell) * (h / cell)
  if (wanted > MAX_CELLS) cell *= Math.sqrt(wanted / MAX_CELLS)
  return { cols: Math.max(24, Math.round(w / cell)), rows: Math.max(24, Math.round(h / cell)) }
}

function makeState(config: LichenConfig, w: number, h: number): LichenState {
  const { cols, rows } = gridFor(w, h)
  const world = createWorld(cols, rows, config)
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(cols, rows)
    : (() => { const c = document.createElement('canvas'); c.width = cols; c.height = rows; return c })()
  const bctx = (canvas as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  return {
    world, cfg: config, pal: buildPalette(config),
    buf: canvas, bctx, img: bctx.createImageData(cols, rows), w, h,
  }
}

// Only the seed and the arena shape rebuild the world; everything else applies live.
const lichen = defineDiversion<typeof lichenSchema, LichenState, '2d'>({
  ...meta,
  schema: lichenSchema,

  setup(_ctx, config, size) {
    return makeState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    // dt is MILLISECONDS, clamped at 50 by the loop. The sim runs in YEARS.
    const dYears = dt / 60000 * state.cfg.yearsPerMinute
    stepWorld(state.world, dYears)
    paint(state.img.data, state.world.colony, state.world.rock, state.cfg, state.pal)
    state.bctx.putImageData(state.img, 0, 0)
    ctx.imageSmoothingEnabled = false
    // Draw the separate offscreen grid onto the display context, in CSS pixels — the host
    // has already applied setTransform(dpr). Never drawImage a canvas onto itself.
    //
    // Zoom is a SOURCE-RECT crop, not a transform on the sim: the whole cliff is still
    // simulated, we just magnify the middle of it. That keeps zoom free of the pointer
    // gesture seam, keeps it live-applicable, and means it cannot restart the world the
    // way a cell-size knob would (#319).
    const { w: gw, h: gh } = state.world.rock
    const z = state.cfg.zoom
    const sw = gw / z, sh = gh / z
    ctx.drawImage(
      state.buf as CanvasImageSource,
      (gw - sw) / 2, (gh - sh) / 2, sw, sh,
      0, 0, state.w, state.h,
    )
  },

  resize(state, size) {
    // ⚠️ HYSTERESIS IS LOAD-BEARING. With a fixed CSS-px cell the derived grid changes
    // every ~2-3 px of window width, and a rebuild costs ~200 ms (nearly all `buildRock`).
    // Rebuilding on every change makes a window drag run at ~5 fps AND restart the cliff
    // from year 0 on every frame of the drag — #319's "the image dances". So only rebuild
    // when the derived grid has drifted more than 10% in either axis; in between, the same
    // grid is simply drawn into a different-sized box, which is what `drawImage` is for.
    const { cols, rows } = gridFor(size.width, size.height)
    const drift = Math.max(
      Math.abs(cols - state.world.rock.w) / state.world.rock.w,
      Math.abs(rows - state.world.rock.h) / state.world.rock.h,
    )
    if (drift < 0.10) {
      state.w = size.width
      state.h = size.height
      return
    }
    const fresh = makeState(state.cfg, size.width, size.height)
    state.world = fresh.world
    state.buf = fresh.buf
    state.bctx = fresh.bctx
    state.img = fresh.img
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    if (config.seed !== state.cfg.seed) return false
    const rock = state.world.rock
    if (config.exposure !== state.cfg.exposure || config.relief !== state.cfg.relief) {
      computeWet(rock, config.exposure, config.relief)
    }
    if (config.bareRock !== state.cfg.bareRock || config.veinStyle !== state.cfg.veinStyle) {
      // Recompute in place and do NOT clear living cells: newly sterile ground only stops
      // future growth, or a slider wipes lichen out from under the cursor.
      computeSterile(rock, config.bareRock, config.veinStyle)
    }
    state.cfg = config
    state.world.cfg = config
    state.pal = buildPalette(config)
    return true
  },
})

export default lichen
