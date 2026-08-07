import { mulberry32 } from '../../framework/rng'
import type { Size } from '../../framework/types'
import { buildField, type Field } from './field'
import { buildFront, frontCell, killCell, exposedHistogram, type Front } from './front'
import { temperedPick } from './scheduler'
import { makeGeom, makeLaser, advance, trackPoint, type Geom, type Laser } from './lasers'
import type { AblationConfig } from './schema'

// State assembly and the per-frame step. No drawing happens here — render.ts owns
// the canvas, this owns what is true.

/** A cell mid-death: it shrinks toward its own centre while draining to black. */
export interface Dying {
  cell: number
  col: number
  row: number
  band: number
  /** seconds elapsed */
  t: number
}

/** A strike, drawn as a brief hard line from the laser to the cell it killed. */
export interface Bolt {
  x0: number
  y0: number
  x1: number
  y1: number
  band: number
  /** the firing laser's charge fraction — a nearly-spent laser lands a dim bolt */
  intensity: number
  t: number
}

export interface AblationState {
  cfg: AblationConfig
  geom: Geom
  field: Field
  front: Front
  lasers: Laser[]
  /** target bands waiting for a free slot on the track, FIFO */
  queue: number[]
  dying: Dying[]
  bolts: Bolt[]
  hist: Uint32Array
  rand: () => number
  /** fractional arrivals carried between frames */
  arrivalDebt: number
  /** how many pictures have been fully consumed */
  pictures: number
  /** total lasers ever released — drives the anti-welding jitter, see `mint` */
  minted: number
  /** distance the last-released laser still has to travel before the gate reopens */
  gateClear: number
  /** cells killed since render last synced the picture buffer */
  patches: number[]
  buffer: HTMLCanvasElement | null
  size: Size
}

const DYING_S = 0.26
const BOLT_S = 0.11
/** Backstop only. `frame()` calls step() and render() in the same tick and render
 *  always drains the list, so in the shipped host this holds one frame of kills
 *  (measured max 17) and never trips. It exists so a future caller that steps
 *  without rendering degrades to one rebuild instead of growing without bound —
 *  note that rebuild is not free, so this is a safety net, not a cheap valve. */
const PATCH_LIMIT = 20000

function newField(cfg: AblationConfig, geom: Geom, generation: number): Field {
  return buildField({
    seed: cfg.seed + generation,
    cols: geom.cols,
    rows: geom.rows,
    bands: cfg.palette.length,
    featureSize: cfg.featureSize,
    roughness: cfg.roughness,
  })
}

export function createState(cfg: AblationConfig, size: Size): AblationState {
  const geom = makeGeom(size, cfg.cellSize, cfg.trackOffset)
  const field = newField(cfg, geom, 0)
  return {
    cfg,
    geom,
    field,
    front: buildFront(field),
    lasers: [],
    queue: [],
    dying: [],
    bolts: [],
    hist: new Uint32Array(field.bands),
    rand: mulberry32(cfg.seed),
    arrivalDebt: 0,
    pictures: 0,
    minted: 0,
    gateClear: 0,
    patches: [],
    buffer: null,
    size,
  }
}

export function step(s: AblationState, dt: number): void {
  const { cfg, geom, field, front } = s

  // 1. Age the short-lived visual lists.
  ageOut(s.dying, dt, DYING_S)
  ageOut(s.bolts, dt, BOLT_S)

  // 2. Advance every laser; a laser that crossed its lane's centre while armed
  //    gets one look at that lane's outermost survivor, and strikes only on a
  //    palette-index match. A miss costs nothing and makes no light.
  const ds = cfg.speed * dt
  // Sub-step so a laser never traverses more than half a cell per `advance`.
  // `advance` tests only the lane it ENDS in, so a single long step silently drops
  // every lane centre it flew over: measured 31 shots per 100 lanes passed at
  // cell 4 / speed 400, and exactly ZERO at cell 2 / speed 600, where the step
  // length and the lane pitch resonate so the centre is always just out of reach.
  // Sub-stepping restores the documented rule — one shot per cell passed.
  const maxStep = Math.max(0.5, geom.cell * 0.5)
  for (const l of s.lasers) {
    let remaining = ds
    while (remaining > 1e-9) {
      const d = Math.min(remaining, maxStep)
      remaining -= d
      const lapsBefore = l.laps
      const fired = advance(geom, l, d)
      // A spent laser is not removed where it happens to run dry — it rides on,
      // dark, until it next crosses the gate (spec §4 rule 6). That limp back to
      // the gate is the visible half of discharge. Once the picture is gone there
      // is nothing left to wait for, so a straggler leaves at its next crossing
      // rather than burning down the lap cap over an empty screen.
      if (l.laps > lapsBefore && (l.charge <= 0 || field.aliveCount === 0)) l.spent = true
      // A dark laser rides, but it does not shoot.
      if (!fired || l.charge <= 0) continue
      const cell = frontCell(field, front, l.edge, l.lane)
      if (cell < 0 || field.idx[cell] !== l.band) continue

      const col = cell % field.cols
      const row = (cell - col) / field.cols
      killCell(field, cell)
      s.patches.push(cell)
      s.dying.push({ cell, col, row, band: l.band, t: 0 })

      const p = trackPoint(geom, l.s)
      l.charge--
      s.bolts.push({
        x0: p.x,
        y0: p.y,
        x1: geom.px + (col + 0.5) * geom.cell,
        y1: geom.py + (row + 0.5) * geom.cell,
        band: l.band,
        // AFTER the decrement: read before it, a laser's last bolt draws at full
        // brightness on the same frame the laser itself goes dark.
        intensity: l.charge / l.maxCharge,
        t: 0,
      })
    }
  }
  if (s.patches.length > PATCH_LIMIT) {
    s.patches.length = 0
    s.buffer = null
  }

  // 3. Eject the spent and the stuck. The lap cap catches a laser whose colour went
  //    extinct before it arrived: it never fires, so it never discharges, so without
  //    the cap it would hold a track slot forever.
  for (let i = s.lasers.length - 1; i >= 0; i--) {
    const l = s.lasers[i]
    if (l.spent || l.laps >= cfg.lapCap) s.lasers.splice(i, 1)
  }

  // 4. What is exposed right now — the only thing new lasers are allowed to see.
  if (s.hist.length !== field.bands) s.hist = new Uint32Array(field.bands)
  exposedHistogram(field, front, s.hist)

  // 5. Mint arrivals. When nothing is exposed there is nothing to tune to, so none
  //    are minted — which is what produces the quiet beat at the end of a picture
  //    without any timer asking for it (spec §6).
  s.arrivalDebt += cfg.arrivalRate * dt
  while (s.arrivalDebt >= 1) {
    const band = temperedPick(s.hist, cfg.targetingBias, s.rand)
    if (band < 0) { s.arrivalDebt = 0; break }
    s.arrivalDebt--
    if (s.queue.length < cfg.capacity) s.queue.push(band)
  }

  // 6. Release from the gate onto the track. Everything enters at the gate and
  //    nowhere else; how far apart they end up is set by how long the gate holds
  //    between releases. Never release onto a picture that is already gone —
  //    launching the backlog there gives each new laser a full lap cap to burn with
  //    nothing to shoot, which turned the intended quiet beat into minutes of black.
  if (field.aliveCount === 0) s.queue.length = 0
  s.gateClear = Math.max(0, s.gateClear - ds)
  while (s.gateClear <= 0 && s.queue.length > 0 && s.lasers.length < cfg.capacity) {
    s.lasers.push(mint(s, s.queue.shift()!, cfg.charge))
    s.gateClear = gateInterval(s)
  }

  // 7. The picture is finished only once the track has emptied too — the stragglers
  //    finish their laps carrying charge they will never spend.
  if (field.aliveCount === 0 && s.lasers.length === 0 && s.dying.length === 0) {
    s.pictures++
    s.field = newField(cfg, geom, s.pictures)
    s.front = buildFront(s.field)
    s.queue.length = 0
    s.patches.length = 0
    s.buffer = null
  }
}

/** Every laser joins the track AT THE GATE — the track's top-left corner, `s = 0`.
 *  Nothing is ever placed further round: a laser that appeared mid-track would pop
 *  into existence ahead of the pack.
 *
 *  Even spacing is therefore a matter of RELEASE TIMING, not position (see
 *  `gateInterval`). The only offset here is a sub-cell golden-ratio jitter, and it
 *  earns its place: two lasers released at an IDENTICAL `s` would be welded for
 *  life — same lane, same centre crossing, every frame — and would double-strike
 *  every lane, breaking the one-shot-per-lane rule. */
function mint(s: AblationState, band: number, charge: number): Laser {
  s.minted++
  return makeLaser(((s.minted * 0.618033988749895) % 1) * s.geom.cell, band, charge)
}

/** How far the last-released laser must travel before the gate opens again.
 *
 *  Every laser moves at the same speed, so holding the gate for `perimeter /
 *  capacity` of travel lands them at exactly even intervals around the track — and
 *  keeps them there, since a replacement enters the same distance behind the one in
 *  front. At spacing 0 the gate never holds and they leave as one bunched pack. */
function gateInterval(s: AblationState): number {
  return s.cfg.spacing * (s.geom.perimeter / Math.max(1, s.cfg.capacity))
}

function ageOut(list: { t: number }[], dt: number, life: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].t += dt
    if (list[i].t >= life) list.splice(i, 1)
  }
}

/** Live-apply a config edit. Returns false for changes the running state cannot
 *  absorb — the framework then tears down and re-runs setup(). */
export function applyConfig(s: AblationState, next: AblationConfig, _size: Size): boolean {
  const prev = s.cfg
  const structural =
    next.cellSize !== prev.cellSize ||
    next.featureSize !== prev.featureSize ||
    next.roughness !== prev.roughness ||
    next.seed !== prev.seed ||
    // a different NUMBER of colours is a different number of contour bands
    next.palette.length !== prev.palette.length ||
    // the track offset sets the margin, which sets how many cells fit — so it
    // resizes the picture grid. Applying it live would leave `geom` describing a
    // different grid than `field` holds: lanes past the new column count would
    // read -1 forever and those outer rows/columns would become immortal.
    next.trackOffset !== prev.trackOffset
  if (structural) return false

  s.cfg = next
  // The picture is a BAKED buffer. A recolour that does not invalidate it leaves
  // the map in the old palette while the lasers, bolts and dying cells switch to
  // the new one — and it stays wrong until the picture completes.
  if (next.background !== prev.background || next.palette.some((c, i) => c !== prev.palette[i])) {
    s.buffer = null
    s.patches.length = 0
  }
  return true
}

export function resizeState(s: AblationState, size: Size): void {
  s.size = size
  s.geom = makeGeom(size, s.cfg.cellSize, s.cfg.trackOffset)
  s.field = newField(s.cfg, s.geom, s.pictures)
  s.front = buildFront(s.field)
  s.lasers.length = 0
  s.queue.length = 0
  s.dying.length = 0
  s.bolts.length = 0
  s.patches.length = 0
  s.buffer = null
}
