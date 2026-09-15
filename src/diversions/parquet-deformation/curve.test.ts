import { describe, it, expect } from 'vitest'
import {
  CURVE_POINTS, SWING_RATIO, resample, lerpCurve, placeEdge, buildTilePath, triWave, paramAt,
  type Curve,
} from './curve'

const straight = (): Curve => resample([[0, 0], [1, 0]], CURVE_POINTS)
const bumpy = (): Curve => resample([[0, 0], [0.3, 0.2], [0.6, -0.15], [1, 0]], CURVE_POINTS)

describe('resample', () => {
  it('returns n points with the endpoints pinned', () => {
    const c = resample([[0, 0], [0.5, 0.4], [1, 0]], 32)
    expect(c.length).toBe(64)
    expect(c[0]).toBeCloseTo(0, 6)
    expect(c[1]).toBeCloseTo(0, 6)
    expect(c[62]).toBeCloseTo(1, 6)
    expect(c[63]).toBeCloseTo(0, 6)
  })

  it('spaces points by equal arc length', () => {
    const c = resample([[0, 0], [1, 0]], 5)
    for (let i = 0; i < 4; i++) expect(c[(i + 1) * 2] - c[i * 2]).toBeCloseTo(0.25, 6)
  })
})

describe('lerpCurve', () => {
  it('returns a at s=0, b at s=1, and the midpoint at s=0.5', () => {
    const a = straight()
    const b = bumpy()
    expect(Array.from(lerpCurve(a, b, 0))).toEqual(Array.from(a))
    expect(Array.from(lerpCurve(a, b, 1))).toEqual(Array.from(b))
    const m = lerpCurve(a, b, 0.5)
    for (let i = 0; i < a.length; i++) expect(m[i]).toBeCloseTo((a[i] + b[i]) / 2, 5)
  })
})

describe('triWave', () => {
  it('ping-pongs 0 to 1 to 0 with period 2 and no discontinuity', () => {
    expect(triWave(0)).toBeCloseTo(0, 6)
    expect(triWave(0.5)).toBeCloseTo(0.5, 6)
    expect(triWave(1)).toBeCloseTo(1, 6)
    expect(triWave(1.5)).toBeCloseTo(0.5, 6)
    expect(triWave(2)).toBeCloseTo(0, 6)
    expect(triWave(-0.25)).toBeCloseTo(0.25, 6)
  })
})

describe('paramAt', () => {
  // The whole point of the swing term: without it, advancing the phase by
  // triWave's period 2 returns the field to a previous state exactly, and a
  // screensaver meant to run for hours loops in well under a minute.
  it('does NOT repeat when the phase advances by triWave period', () => {
    // The threshold must exceed the RENDERING floor, not merely be non-zero: t is
    // quantised to 1/255 downstream, so a difference of 1e-4 is 39x below what a
    // viewer could see and this would pass on a bit-identical picture.
    const FLOOR = 2 / 255
    for (const y of [2, 6, 11]) {
      const a = paramAt('Ramp', 3.5, y, 4.5, 3, 14, 0.7)
      const b = paramAt('Ramp', 3.5, y, 4.5, 3, 14, 0.7 + 2)
      expect(Math.abs(a - b), `y=${y}`).toBeGreaterThan(FLOOR)
    }
  })

  it('the swing ratio is not a simple fraction, so the two periods never align', () => {
    for (let q = 1; q <= 12; q++) {
      expect(Math.abs(SWING_RATIO * q - Math.round(SWING_RATIO * q))).toBeGreaterThan(0.01)
    }
  })

  // Ramp and Diagonal must pivot on a LATTICE constant, never on the view centre:
  // a viewport-dependent field pops on resize and makes one URL render different
  // parts of the catalogue in the Config preview and on Play.
  it('Ramp and Diagonal ignore the view centre entirely', () => {
    for (const k of ['Ramp', 'Diagonal'] as const) {
      const a = paramAt(k, 5.5, 3, 4.5, 3, 14, 0.7)
      const b = paramAt(k, 5.5, 3, 19.5, 11, 14, 0.7)
      expect(a, k).toBeCloseTo(b, 12)
    }
  })

  it('Radial does use the view centre — rings belong centred on the screen', () => {
    const a = paramAt('Radial', 5.5, 3, 4.5, 3, 14, 0.7)
    const b = paramAt('Radial', 5.5, 3, 19.5, 11, 14, 0.7)
    expect(Math.abs(a - b)).toBeGreaterThan(2 / 255)
  })

  it('stays within 0..1 for every field and a wide phase sweep', () => {
    for (const k of ['Ramp', 'Radial', 'Diagonal'] as const) {
      for (let p = 0; p < 40; p += 0.37) {
        const v = paramAt(k, 17, -5, 4.5, 3, 14, p)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('placeEdge', () => {
  it('reversed emits the same points in reverse order, offsets unchanged', () => {
    const c = bumpy()
    const fwd: number[] = []
    const rev: number[] = []
    placeEdge(fwd, 2, 3, 3, 3, c, 1, false)
    placeEdge(rev, 2, 3, 3, 3, c, 1, true)
    const n = fwd.length / 2
    for (let i = 0; i < n; i++) {
      expect(rev[i * 2]).toBeCloseTo(fwd[(n - 1 - i) * 2], 6)
      expect(rev[i * 2 + 1]).toBeCloseTo(fwd[(n - 1 - i) * 2 + 1], 6)
    }
  })

  it('starts at A and ends at B when forward', () => {
    const out: number[] = []
    placeEdge(out, 2, 3, 3, 3, bumpy(), 1.7, false)
    expect(out[0]).toBeCloseTo(2, 6)
    expect(out[1]).toBeCloseTo(3, 6)
    expect(out[out.length - 2]).toBeCloseTo(3, 6)
    expect(out[out.length - 1]).toBeCloseTo(3, 6)
  })

  it('amplitude scales the perpendicular offset and nothing else', () => {
    const a: number[] = []
    const b: number[] = []
    placeEdge(a, 0, 0, 1, 0, bumpy(), 1, false)
    placeEdge(b, 0, 0, 1, 0, bumpy(), 2.5, false)
    for (let i = 0; i < a.length / 2; i++) {
      expect(b[i * 2]).toBeCloseTo(a[i * 2], 6)
      expect(b[i * 2 + 1]).toBeCloseTo(a[i * 2 + 1] * 2.5, 6)
    }
  })
})

describe('buildTilePath — the gap-free keystone', () => {
  // 64 entries, not 3. A small LUT buckets every midpoint into the same bin, so
  // adjacent tiles resolve the SAME curve object whatever they read — which makes
  // the non-vacuity check below pass for the wrong reason and makes the
  // tile-centre mutation undetectable under most fields.
  const LUT = Array.from({ length: 64 }, (_, i) => lerpCurve(straight(), bumpy(), i / 63))
  const idx = (t: number) => Math.round(t * (LUT.length - 1))
  // cx = 4.5, not 4: at an integer cx the two sample tiles below sit in mirror
  // position about the Radial centre, and Math.hypot is even in px, so Radial
  // computes an identical value for both at any LUT size, at any phase, forever.
  const CX = 4.5
  const CY = 3
  const edgesFor = (k: 'Ramp' | 'Radial' | 'Diagonal', i: number, j: number, ph: number) =>
    [
      LUT[idx(paramAt(k, i + 0.5, j, CX, CY, 7, ph))],
      LUT[idx(paramAt(k, i + 1, j + 0.5, CX, CY, 7, ph))],
      LUT[idx(paramAt(k, i + 0.5, j + 1, CX, CY, 7, ph))],
      LUT[idx(paramAt(k, i, j + 0.5, CX, CY, 7, ph))],
    ] as [Curve, Curve, Curve, Curve]
  const n = CURVE_POINTS

  // Vertical neighbours share their horizontal edge. NOTE under 'Ramp' this pair
  // is the WEAK case — paramAt has almost no y term there — so only the traversal
  // bookkeeping is under test. The horizontal pair below is the one that fails if
  // an edge reads the tile centre instead of its own midpoint.
  const sharedHorizontal = (amp: number, k: 'Ramp' | 'Radial' | 'Diagonal', ph: number) => {
    const lower: number[] = []
    const upper: number[] = []
    buildTilePath(lower, 3, 4, edgesFor(k, 3, 4, ph), amp)
    buildTilePath(upper, 3, 5, edgesFor(k, 3, 5, ph), amp)
    for (let i = 0; i < n; i++) {
      const lo = (2 * n + i) * 2 // lower tile, top run, emitted reversed
      const up = (n - 1 - i) * 2 // upper tile, bottom run, forward
      expect(lower[lo]).toBeCloseTo(upper[up], 5)
      expect(lower[lo + 1]).toBeCloseTo(upper[up + 1], 5)
    }
  }

  // Horizontal neighbours share their vertical edge, and under EVERY field the
  // two tiles compute four genuinely different parameters. This is the case the
  // "read t at the edge midpoint" rule exists for.
  const sharedVertical = (amp: number, k: 'Ramp' | 'Radial' | 'Diagonal', ph: number) => {
    const left: number[] = []
    const right: number[] = []
    buildTilePath(left, 3, 4, edgesFor(k, 3, 4, ph), amp)
    buildTilePath(right, 4, 4, edgesFor(k, 4, 4, ph), amp)
    for (let i = 0; i < n; i++) {
      const l = (n + i) * 2 // left tile, right run, forward
      const r = (3 * n + (n - 1 - i)) * 2 // right tile, left run, emitted reversed
      expect(left[l]).toBeCloseTo(right[r], 5)
      expect(left[l + 1]).toBeCloseTo(right[r + 1], 5)
    }
  }

  // The spec asks for the guarantee at the slider's bounds, not just the default.
  for (const amp of [0.2, 1.7, 2.0]) {
    for (const k of ['Ramp', 'Radial', 'Diagonal'] as const) {
      it(`shared horizontal edge matches — ${k}, amp ${amp}`, () => sharedHorizontal(amp, k, 0.31))
      it(`shared vertical edge matches — ${k}, amp ${amp}`, () => sharedVertical(amp, k, 0.31))
    }
  }

  it('the parameters actually differ between a tile edges (non-vacuity)', () => {
    const a = edgesFor('Ramp', 3, 4, 0.31)
    expect(new Set(a).size).toBeGreaterThan(1)
  })

  it('closes: the last point returns to the first', () => {
    const out: number[] = []
    buildTilePath(out, 0, 0, [bumpy(), bumpy(), bumpy(), bumpy()], 1.7)
    expect(out[out.length - 2]).toBeCloseTo(out[0], 5)
    expect(out[out.length - 1]).toBeCloseTo(out[1], 5)
  })
})
