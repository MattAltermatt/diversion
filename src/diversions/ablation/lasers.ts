import { EDGE, type Edge } from './front'

// Track geometry and the laser lifecycle.
//
// A laser's position on the track is ONE scalar: `s`, the distance travelled
// clockwise around the track rectangle from its top-left corner. `trackPoint`
// resolves that scalar into everything anyone downstream needs — draw position,
// which edge, the inward beam direction, and which lane of the picture the beam
// falls on. Every other module deals in that resolved form (spec §9).
//
// The track rectangle is the picture expanded by `gap` on all four sides, and that
// offset does two jobs for free (spec §3): the first and last `gap` of every edge
// sits past the picture's corner, so `lane` there is -1 and the beam finds nothing
// — corner dead zones with no corner logic to write — and every beam crosses a
// stretch of empty space before it lands, so a strike has room to read as a strike.

export interface Geom {
  /** picture top-left, CSS px */
  px: number
  py: number
  /** picture size, CSS px */
  pw: number
  ph: number
  /** cell size, CSS px */
  cell: number
  cols: number
  rows: number
  /** track offset from the picture */
  gap: number
  perimeter: number
  /** run lengths of the four track edges, in perimeter order top→right→bottom→left */
  seg: [number, number, number, number]
}

export interface TrackPoint {
  /** laser position on the track, CSS px */
  x: number
  y: number
  edge: Edge
  /** inward unit beam direction */
  dx: number
  dy: number
  /** column (top/bottom) or row (left/right); -1 = past the picture's corner */
  lane: number
  /** perimeter coord of that lane's centre; NaN when lane < 0 */
  laneCentre: number
}

export interface Laser {
  /** perimeter position */
  s: number
  /** target palette index */
  band: number
  charge: number
  maxCharge: number
  laps: number
  /** edge currently ridden — part of the lane's identity, see `advance` */
  edge: Edge
  /** lane currently occupied (-1 = none / off the picture) */
  lane: number
  /** may still fire in this lane */
  armed: boolean
  /** ran dry and has since reached the gate — eject it there, not where it ran out */
  spent: boolean
}

export function makeLaser(s: number, band: number, charge: number): Laser {
  // lane -1 means "not in a lane yet", so the first `advance` establishes both the
  // edge and the lane and arms the laser wherever it was dropped.
  return { s, band, charge, maxCharge: charge, laps: 0, edge: EDGE.top, lane: -1, armed: false, spent: false }
}

/** Picture fills the canvas minus the track margin, snapped DOWN to whole cells so
 *  the grid never has a ragged partial column, then centred in the leftover. */
export function makeGeom(size: { width: number; height: number }, cell: number, gap: number): Geom {
  // The margin has to clear the gap AND leave the track room to sit visibly inside
  // the canvas — a track hard against the edge gets its lasers clipped in half, and
  // the picture reads as filling the screen rather than floating in a frame. The
  // proportional term keeps that framing at any viewport size.
  const pad = Math.max(16, Math.min(size.width, size.height) * 0.055)
  const margin = gap + pad
  const availW = Math.max(cell, size.width - margin * 2)
  const availH = Math.max(cell, size.height - margin * 2)
  const cols = Math.max(1, Math.floor(availW / cell))
  const rows = Math.max(1, Math.floor(availH / cell))
  const pw = cols * cell
  const ph = rows * cell
  const px = Math.round((size.width - pw) / 2)
  const py = Math.round((size.height - ph) / 2)
  const w = pw + gap * 2
  const h = ph + gap * 2
  const seg: [number, number, number, number] = [w, h, w, h]
  return { px, py, pw, ph, cell, cols, rows, gap, perimeter: 2 * (w + h), seg }
}

function wrap(s: number, perimeter: number): number {
  const v = s % perimeter
  return v < 0 ? v + perimeter : v
}

/** `offset` is measured along the picture's own axis, so anything outside
 *  [0, count*cell) is past a corner and hits nothing. */
function laneOf(offset: number, cell: number, count: number): number {
  if (offset < 0) return -1
  const lane = Math.floor(offset / cell)
  return lane >= count ? -1 : lane
}

/** Resolves a perimeter coordinate into a point on the track. Wraps, so `s` and
 *  `s + perimeter` resolve identically and a negative `s` counts backwards. */
export function trackPoint(g: Geom, sRaw: number): TrackPoint {
  const s = wrap(sRaw, g.perimeter)
  // Track rectangle: the picture expanded by `gap` on every side.
  const tx = g.px - g.gap
  const ty = g.py - g.gap
  const [w, h] = [g.seg[0], g.seg[1]]
  const s1 = w
  const s2 = w + h
  const s3 = w + h + w

  if (s < s1) {
    // Top edge, left→right. The lane's centre sits `gap + (lane+0.5)*cell` along.
    const x = tx + s
    const lane = laneOf(x - g.px, g.cell, g.cols)
    const laneCentre = lane < 0 ? NaN : g.gap + (lane + 0.5) * g.cell
    return { x, y: ty, edge: EDGE.top, dx: 0, dy: 1, lane, laneCentre }
  }
  if (s < s2) {
    // Right edge, top→bottom. Lanes are rows, still counting up with `s`.
    const y = ty + (s - s1)
    const lane = laneOf(y - g.py, g.cell, g.rows)
    const laneCentre = lane < 0 ? NaN : s1 + g.gap + (lane + 0.5) * g.cell
    return { x: tx + w, y, edge: EDGE.right, dx: -1, dy: 0, lane, laneCentre }
  }
  if (s < s3) {
    // Bottom edge, right→LEFT. The walk runs backwards along the picture's x axis,
    // so lane 0 (the leftmost column) is the LAST one reached and lane centres
    // DECREASE as the lane index grows. Getting this sign wrong mirrors every lane
    // on this edge onto its opposite number, and the beams stop landing.
    const d = s - s2
    const x = tx + w - d
    const lane = laneOf(x - g.px, g.cell, g.cols)
    const laneCentre = lane < 0 ? NaN : s2 + (w - g.gap - (lane + 0.5) * g.cell)
    return { x, y: ty + h, edge: EDGE.bottom, dx: 0, dy: -1, lane, laneCentre }
  }
  // Left edge, bottom→TOP — same reversal as the bottom edge, along y.
  const d = s - s3
  const y = ty + h - d
  const lane = laneOf(y - g.py, g.cell, g.rows)
  const laneCentre = lane < 0 ? NaN : s3 + (h - g.gap - (lane + 0.5) * g.cell)
  return { x: tx, y, edge: EDGE.left, dx: 1, dy: 0, lane, laneCentre }
}

/** Advances a laser, wrapping the perimeter and counting laps. Entering a new lane
 *  re-arms it; crossing that lane's centre spends the arm (spec §4 rule 4).
 *  Returns true if it may take a shot this step — armed, in a valid lane, and this
 *  step's movement crossed that lane's centre. One shot per lane, maximum.
 *
 *  The crossing test lives in perimeter space, not lane space: a lane's centre is a
 *  single scalar, and the laser just traversed the half-open span (prevS, prevS+ds].
 *  That works uniformly on all four edges even though the bottom and left edges
 *  number their lanes backwards, and it needs no special case for a step that skips
 *  several lanes at once. */
export function advance(g: Geom, l: Laser, ds: number): boolean {
  const prevS = wrap(l.s, g.perimeter)
  const next = prevS + ds
  const laps = Math.floor(next / g.perimeter)
  if (laps > 0) l.laps += laps
  l.s = next - laps * g.perimeter

  const after = trackPoint(g, l.s)
  // Lane identity is (edge, lane), never the lane index alone: left lane 0 and top
  // lane 0 share a number and are separated by only 2*gap of dead zone, so a step
  // longer than that would look like "same lane" and silently skip the re-arm.
  const entered = after.edge !== l.edge || after.lane !== l.lane
  l.edge = after.edge
  l.lane = after.lane
  if (entered) l.armed = after.lane >= 0
  if (!l.armed || l.lane < 0) return false

  // Lift the centre into the traversed span when the step wrapped past the
  // perimeter end (both values start in [0, perimeter), so one lift is enough).
  let centre = after.laneCentre
  if (centre < prevS) centre += g.perimeter
  if (centre <= prevS || centre > next) return false

  l.armed = false
  return true
}
