import { describe, it, expect } from 'vitest'
import { makeGeom, trackPoint, advance, makeTurret } from './turrets'
import { EDGE, type Edge } from './front'

const SIZE = { width: 400, height: 300 }
const G = makeGeom(SIZE, 10, 20)

/** Perimeter coordinate where each edge starts, in walk order top→right→bottom→left. */
const START = [0, G.seg[0], G.seg[0] + G.seg[1], G.seg[0] + G.seg[1] + G.seg[2]]

/** Middle of edge `e` in perimeter coordinates. */
const mid = (e: number) => START[e] + G.seg[e] / 2

// Independent lookup of a lane's centre: walk the whole track and record what
// `trackPoint` reports at every sample. Round-tripping THAT back through
// `trackPoint` is what catches a laneCentre sign error — the bottom and left edges
// run backwards along their axis, so their centres must DECREASE with lane index.
let centreMap: Map<string, number> | null = null
function centreOf(edge: Edge, lane: number): number {
  if (!centreMap) {
    centreMap = new Map()
    for (let s = 0; s < G.perimeter; s += 0.25) {
      const p = trackPoint(G, s)
      if (p.lane >= 0) centreMap.set(`${p.edge}:${p.lane}`, p.laneCentre)
    }
  }
  const c = centreMap.get(`${edge}:${lane}`)
  if (c === undefined) throw new Error(`no lane ${lane} on edge ${edge}`)
  return c
}

/** Every (edge, lane) pair that a beam can actually reach. */
function allLanes(): string[] {
  const keys: string[] = []
  for (let col = 0; col < G.cols; col++) keys.push(`${EDGE.top}:${col}`, `${EDGE.bottom}:${col}`)
  for (let row = 0; row < G.rows; row++) keys.push(`${EDGE.right}:${row}`, `${EDGE.left}:${row}`)
  return keys
}

describe('makeGeom', () => {
  it('fits the picture inside the canvas minus the track margin', () => {
    expect(G.px).toBeGreaterThanOrEqual(G.gap)
    expect(G.py).toBeGreaterThanOrEqual(G.gap)
    expect(G.px + G.pw).toBeLessThanOrEqual(SIZE.width)
    expect(G.py + G.ph).toBeLessThanOrEqual(SIZE.height)
  })

  it('derives a whole number of cells', () => {
    expect(G.cols).toBe(Math.floor(G.pw / G.cell))
    expect(G.rows).toBe(Math.floor(G.ph / G.cell))
    expect(G.pw).toBe(G.cols * G.cell)
    expect(G.ph).toBe(G.rows * G.cell)
    expect(G.cols).toBeGreaterThan(0)
    expect(G.rows).toBeGreaterThan(0)
  })

  it('centres the picture in the canvas', () => {
    expect(Math.abs(G.px - (SIZE.width - G.px - G.pw))).toBeLessThanOrEqual(1)
    expect(Math.abs(G.py - (SIZE.height - G.py - G.ph))).toBeLessThanOrEqual(1)
  })

  it('perimeter equals the sum of the four segments', () => {
    expect(G.seg.reduce((a, b) => a + b, 0)).toBeCloseTo(G.perimeter, 6)
    expect(G.seg[0]).toBeCloseTo(G.pw + G.gap * 2, 6)
    expect(G.seg[1]).toBeCloseTo(G.ph + G.gap * 2, 6)
  })

  it('keeps at least one cell on a canvas smaller than its own margins', () => {
    const tiny = makeGeom({ width: 40, height: 30 }, 10, 20)
    expect(tiny.cols).toBeGreaterThanOrEqual(1)
    expect(tiny.rows).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(tiny.perimeter)).toBe(true)
    expect(tiny.perimeter).toBeGreaterThan(0)
  })
})

describe('trackPoint', () => {
  it('walks all four edges with inward beams', () => {
    expect(trackPoint(G, mid(0)).edge).toBe(EDGE.top)
    expect(trackPoint(G, mid(0)).dy).toBe(1)
    expect(trackPoint(G, mid(0)).dx).toBe(0)
    expect(trackPoint(G, mid(1)).edge).toBe(EDGE.right)
    expect(trackPoint(G, mid(1)).dx).toBe(-1)
    expect(trackPoint(G, mid(1)).dy).toBe(0)
    expect(trackPoint(G, mid(2)).edge).toBe(EDGE.bottom)
    expect(trackPoint(G, mid(2)).dy).toBe(-1)
    expect(trackPoint(G, mid(2)).dx).toBe(0)
    expect(trackPoint(G, mid(3)).edge).toBe(EDGE.left)
    expect(trackPoint(G, mid(3)).dx).toBe(1)
    expect(trackPoint(G, mid(3)).dy).toBe(0)
  })

  it('puts each edge on the right side of the track rectangle', () => {
    const tx = G.px - G.gap
    const ty = G.py - G.gap
    expect(trackPoint(G, mid(0)).y).toBeCloseTo(ty, 6)
    expect(trackPoint(G, mid(1)).x).toBeCloseTo(tx + G.seg[0], 6)
    expect(trackPoint(G, mid(2)).y).toBeCloseTo(ty + G.seg[1], 6)
    expect(trackPoint(G, mid(3)).x).toBeCloseTo(tx, 6)
  })

  it('reports lane -1 in every corner dead zone', () => {
    // The first and last `gap` of every edge sits past the picture's corner, so
    // its beam finds nothing. This must fall out of the geometry, not a special case.
    for (let e = 0; e < 4; e++) {
      expect(trackPoint(G, START[e] + 1).lane, `edge ${e} head`).toBe(-1)
      expect(trackPoint(G, START[e] + G.gap - 0.001).lane, `edge ${e} head end`).toBe(-1)
      expect(trackPoint(G, START[e] + G.seg[e] - 1).lane, `edge ${e} tail`).toBe(-1)
      expect(trackPoint(G, START[e] + G.seg[e] - G.gap + 0.001).lane, `edge ${e} tail start`).toBe(-1)
    }
  })

  it('numbers lanes backwards on the bottom and left edges', () => {
    // The walk is clockwise, so bottom runs right→left and left runs bottom→top:
    // the FIRST lane those edges reach is the LAST lane index.
    const first = [0, 0, G.cols - 1, G.rows - 1]
    const last = [G.cols - 1, G.rows - 1, 0, 0]
    for (let e = 0; e < 4; e++) {
      expect(trackPoint(G, START[e] + G.gap + 0.001).lane, `edge ${e} first`).toBe(first[e])
      expect(trackPoint(G, START[e] + G.seg[e] - G.gap - 0.001).lane, `edge ${e} last`).toBe(last[e])
    }
  })

  it('maps the middle of the top edge to a real column', () => {
    const p = trackPoint(G, mid(0))
    expect(p.lane).toBeGreaterThanOrEqual(0)
    expect(p.lane).toBeLessThan(G.cols)
  })

  it('wraps a perimeter coordinate past the end', () => {
    const a = trackPoint(G, 5)
    const b = trackPoint(G, 5 + G.perimeter)
    expect(b.x).toBeCloseTo(a.x, 6)
    expect(b.y).toBeCloseTo(a.y, 6)
    expect(b.edge).toBe(a.edge)
    expect(trackPoint(G, G.perimeter).x).toBeCloseTo(trackPoint(G, 0).x, 6)
    expect(trackPoint(G, G.perimeter).y).toBeCloseTo(trackPoint(G, 0).y, 6)
  })

  it('wraps a negative perimeter coordinate', () => {
    const a = trackPoint(G, G.perimeter - 7)
    const b = trackPoint(G, -7)
    expect(b.x).toBeCloseTo(a.x, 6)
    expect(b.y).toBeCloseTo(a.y, 6)
    expect(b.edge).toBe(a.edge)
  })

  it('reports laneCentre as NaN outside the picture', () => {
    expect(Number.isNaN(trackPoint(G, 1).laneCentre)).toBe(true)
    expect(Number.isNaN(trackPoint(G, mid(0)).laneCentre)).toBe(false)
  })

  it('places every laneCentre within half a cell of its own lane', () => {
    // The sign-error catcher. On the bottom and left edges the lane index counts
    // DOWN as the perimeter coordinate goes up; get that backwards and a lane's
    // centre lands on the mirrored lane, half a track away.
    for (let s = 0; s < G.perimeter; s += 0.25) {
      const p = trackPoint(G, s)
      if (p.lane < 0) continue
      expect(Math.abs(p.laneCentre - s), `s=${s} edge=${p.edge} lane=${p.lane}`)
        .toBeLessThanOrEqual(G.cell / 2 + 1e-9)
    }
  })

  it('round-trips every lane centre back to its own lane and cell centre', () => {
    const tx = G.px - G.gap
    const ty = G.py - G.gap
    const check = (edge: Edge, lane: number, x: number, y: number) => {
      const p = trackPoint(G, centreOf(edge, lane))
      expect(p.edge, `edge ${edge} lane ${lane}`).toBe(edge)
      expect(p.lane, `edge ${edge} lane ${lane}`).toBe(lane)
      expect(p.x).toBeCloseTo(x, 6)
      expect(p.y).toBeCloseTo(y, 6)
    }
    for (let col = 0; col < G.cols; col++) {
      const cx = G.px + (col + 0.5) * G.cell
      check(EDGE.top, col, cx, ty)
      check(EDGE.bottom, col, cx, ty + G.seg[1])
    }
    for (let row = 0; row < G.rows; row++) {
      const cy = G.py + (row + 0.5) * G.cell
      check(EDGE.right, row, tx + G.seg[0], cy)
      check(EDGE.left, row, tx, cy)
    }
  })

  it('lane centres increase monotonically along the walk', () => {
    let last = -Infinity
    for (let s = 0; s < G.perimeter; s += 0.25) {
      const p = trackPoint(G, s)
      if (p.lane < 0) continue
      if (p.laneCentre === last) continue
      expect(p.laneCentre, `s=${s}`).toBeGreaterThan(last)
      last = p.laneCentre
    }
  })
})

describe('makeTurret', () => {
  it('starts unarmed and outside any lane', () => {
    const l = makeTurret(17, 3, 40)
    expect(l.s).toBe(17)
    expect(l.band).toBe(3)
    expect(l.charge).toBe(40)
    expect(l.maxCharge).toBe(40)
    expect(l.laps).toBe(0)
    expect(l.lane).toBe(-1)
    expect(l.armed).toBe(false)
  })
})

describe('advance', () => {
  it('fires at most once per lane', () => {
    const l = makeTurret(mid(0), 0, 100)
    let fires = 0
    const lanes = new Set<number>()
    for (let i = 0; i < 40; i++) {
      if (advance(G, l, G.cell / 4)) fires++
      if (l.lane >= 0) lanes.add(l.lane)
    }
    expect(fires).toBeLessThanOrEqual(lanes.size)
    expect(fires).toBeGreaterThan(0)
  })

  it('re-arms on entering a new lane', () => {
    const l = makeTurret(mid(0), 0, 100)
    advance(G, l, G.cell / 4)
    l.armed = false
    const startLane = l.lane
    for (let i = 0; i < 20 && l.lane === startLane; i++) advance(G, l, G.cell / 4)
    expect(l.lane).not.toBe(startLane)
    expect(l.armed).toBe(true)
  })

  it('fires on crossing the lane centre, not on entering the lane', () => {
    const l = makeTurret(0, 0, 100)
    const centre = centreOf(EDGE.top, 0)
    expect(advance(G, l, centre - G.cell / 2 + 0.5)).toBe(false) // inside lane 0, short of centre
    expect(l.lane).toBe(0)
    expect(l.armed).toBe(true)
    expect(advance(G, l, G.cell / 2)).toBe(true)                 // steps over the centre
    expect(l.armed).toBe(false)
    expect(l.lane).toBe(0)                                       // and is still in lane 0
  })

  it('counts a lap on wrapping the perimeter', () => {
    const l = makeTurret(0, 0, 100)
    expect(l.laps).toBe(0)
    advance(G, l, G.perimeter * 1.5)
    expect(l.laps).toBe(1)
    expect(l.s).toBeLessThan(G.perimeter)
    expect(l.s).toBeCloseTo(G.perimeter * 0.5, 6)
    advance(G, l, G.perimeter * 0.6)
    expect(l.laps).toBe(2)
  })

  it('never fires while in a corner dead zone', () => {
    const l = makeTurret(0, 0, 100)
    let fired = false
    for (let i = 0; i < 4 && l.s < G.gap; i++) fired = advance(G, l, 1) || fired
    expect(fired).toBe(false)
    expect(l.lane).toBe(-1)
    expect(l.armed).toBe(false)
  })

  it('fires exactly once for every lane of every edge over one lap', () => {
    // The headline property, and the one a two-edges-only sign error breaks: a fine
    // step around the whole track must hand out exactly one shot per reachable lane,
    // on all four edges.
    const l = makeTurret(0, 0, 10_000)
    const ds = G.cell / 4
    const steps = Math.round(G.perimeter / ds)
    const fired = new Map<string, number>()
    for (let i = 0; i < steps; i++) {
      if (!advance(G, l, ds)) continue
      const key = `${trackPoint(G, l.s).edge}:${l.lane}`
      fired.set(key, (fired.get(key) ?? 0) + 1)
    }
    expect(l.laps).toBe(1)
    const expected = allLanes()
    expect(new Set(fired.keys())).toEqual(new Set(expected))
    expect(fired.size).toBe(G.cols * 2 + G.rows * 2)
    for (const [key, n] of fired) expect(n, key).toBe(1)
  })

  it('never fires twice in one lane even when the step skips whole lanes', () => {
    const l = makeTurret(0, 0, 10_000)
    const ds = G.cell * 3.5
    const steps = Math.ceil(G.perimeter / ds)
    const fired = new Map<string, number>()
    for (let i = 0; i < steps && l.laps === 0; i++) {
      if (!advance(G, l, ds)) continue
      const key = `${trackPoint(G, l.s).edge}:${l.lane}`
      fired.set(key, (fired.get(key) ?? 0) + 1)
    }
    expect(fired.size).toBeGreaterThan(0)
    for (const [key, n] of fired) expect(n, key).toBe(1)
  })

  it('re-arms across the left→top corner when one step jumps both dead zones', () => {
    // Left lane 0 and top lane 0 carry the SAME lane number, and only 2*gap of dead
    // zone separates them — so a step longer than that crosses from one to the other
    // with no lane-index change to notice. Identity has to include the edge.
    const l = makeTurret(0, 0, 100)
    const leftZero = centreOf(EDGE.left, 0)
    expect(advance(G, l, leftZero)).toBe(true)
    expect(trackPoint(G, l.s).edge).toBe(EDGE.left)
    expect(l.lane).toBe(0)
    expect(l.armed).toBe(false)

    const jump = G.perimeter - leftZero + centreOf(EDGE.top, 0)
    expect(jump).toBeGreaterThan(G.gap * 2) // it really does clear both dead zones
    expect(advance(G, l, jump)).toBe(true)
    expect(trackPoint(G, l.s).edge).toBe(EDGE.top)
    expect(l.lane).toBe(0)
  })

  it('normalises a turret parked beyond one perimeter', () => {
    const l = makeTurret(G.perimeter + mid(0), 0, 100)
    advance(G, l, G.cell / 4)
    expect(l.s).toBeGreaterThanOrEqual(0)
    expect(l.s).toBeLessThan(G.perimeter)
    expect(l.s).toBeCloseTo(mid(0) + G.cell / 4, 6)
  })
})
