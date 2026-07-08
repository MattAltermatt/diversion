import { describe, it, expect } from 'vitest'
import { make2DContext } from '../../test-setup'
import {
  createVoronoiState, stepVoronoi, resizeVoronoi, updatePositions,
  nearestSite, buildPaletteLUT, polygonArea,
} from './voronoi'
import type { VoronoiConfig } from './schema'
import type { RenderContext } from '../../framework/types'

const cfg = (over: Partial<VoronoiConfig> = {}): VoronoiConfig => ({
  siteCount: 60, driftSpeed: 0.5, driftRadius: 0.22, fillMode: 'site',
  palette: ['#1a0a3c', '#7b2fbf', '#c23b6e', '#e8823c', '#f0d060'],
  edgeWidth: 1.5, edgeColor: '#05070d', seed: 1,
  ...over,
})

describe('polygonArea', () => {
  it('measures a unit square as 1', () => {
    expect(Math.abs(polygonArea([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]))).toBeCloseTo(1)
  })
})

describe('buildPaletteLUT', () => {
  it('bakes 256 rgba() strings', () => {
    const lut = buildPaletteLUT(['#000000', '#ffffff'])
    expect(lut.length).toBe(256)
    expect(lut[0]).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/)
  })
})

describe('createVoronoiState', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect([...createVoronoiState(cfg(), 800, 600).points])
      .toEqual([...createVoronoiState(cfg(), 800, 600).points])
    expect([...createVoronoiState(cfg({ seed: 1 }), 800, 600).points])
      .not.toEqual([...createVoronoiState(cfg({ seed: 2 }), 800, 600).points])
  })

  it('places every site strictly inside the canvas bounds (orbit never escapes)', () => {
    const st = createVoronoiState(cfg({ siteCount: 100, driftRadius: 0.4 }), 500, 400)
    // sample the orbit across many phases of the clock to check the amplitude bound holds
    for (let step = 0; step < 40; step++) {
      st.t = step * 3.1
      updatePositions(st)
      for (let i = 0; i < st.points.length; i += 2) {
        expect(st.points[i]).toBeGreaterThanOrEqual(0)
        expect(st.points[i]).toBeLessThanOrEqual(500)
        expect(st.points[i + 1]).toBeGreaterThanOrEqual(0)
        expect(st.points[i + 1]).toBeLessThanOrEqual(400)
      }
    }
  })
})

describe('nearestSite (Voronoi correctness)', () => {
  it('assigns a probe point to its nearest site', () => {
    const st = createVoronoiState(cfg({ siteCount: 4 }), 100, 100)
    // hand-place four sites at the corners of a 100x100 field via homes/points directly
    st.homeX.set([10, 90, 10, 90])
    st.homeY.set([10, 10, 90, 90])
    st.amp.fill(0) // no orbit — pin sites exactly at their home
    updatePositions(st)
    st.delaunay.update()
    st.voronoi = st.delaunay.voronoi([0, 0, 100, 100])

    expect(nearestSite(st, 5, 5)).toBe(0) // near top-left site
    expect(nearestSite(st, 95, 5)).toBe(1) // near top-right site
    expect(nearestSite(st, 5, 95)).toBe(2) // near bottom-left site
    expect(nearestSite(st, 95, 95)).toBe(3) // near bottom-right site
  })

  it('reassigns a cell when its nearest site moves away', () => {
    const st = createVoronoiState(cfg({ siteCount: 2 }), 100, 100)
    st.homeX.set([20, 80])
    st.homeY.set([50, 50])
    st.amp.fill(0)
    updatePositions(st)
    st.delaunay.update()
    st.voronoi = st.delaunay.voronoi([0, 0, 100, 100])

    const probeX = 45, probeY = 50 // slightly closer to site 0 (20) than site 1 (80)
    expect(nearestSite(st, probeX, probeY)).toBe(0)

    // move site 0 far away — the probe should now belong to site 1
    st.homeX.set([-500, 80])
    updatePositions(st)
    st.delaunay.update()
    st.voronoi = st.delaunay.voronoi([0, 0, 100, 100])
    expect(nearestSite(st, probeX, probeY)).toBe(1)
  })
})

describe('stepVoronoi', () => {
  it('renders every frame without throwing and keeps sites in bounds', () => {
    const st = createVoronoiState(cfg({ siteCount: 80 }), 400, 300)
    const ctx = make2DContext() as unknown as RenderContext & CanvasRenderingContext2D
    for (let k = 0; k < 30; k++) stepVoronoi(st, ctx, 16)
    for (let i = 0; i < st.points.length; i += 2) {
      expect(st.points[i]).toBeGreaterThanOrEqual(0)
      expect(st.points[i]).toBeLessThanOrEqual(400)
      expect(st.points[i + 1]).toBeGreaterThanOrEqual(0)
      expect(st.points[i + 1]).toBeLessThanOrEqual(300)
    }
  })

  it('reshapes the mosaic over time (site positions actually change)', () => {
    const st = createVoronoiState(cfg({ siteCount: 40 }), 400, 300)
    const before = [...st.points]
    const ctx = make2DContext() as unknown as RenderContext & CanvasRenderingContext2D
    for (let k = 0; k < 60; k++) stepVoronoi(st, ctx, 16)
    expect([...st.points]).not.toEqual(before)
  })
})

describe('resizeVoronoi', () => {
  it('keeps sites within the new bounds after a resize', () => {
    const st = createVoronoiState(cfg({ siteCount: 50 }), 400, 300)
    resizeVoronoi(st, 800, 600)
    for (let i = 0; i < st.points.length; i += 2) {
      expect(st.points[i]).toBeGreaterThanOrEqual(0)
      expect(st.points[i]).toBeLessThanOrEqual(800)
      expect(st.points[i + 1]).toBeGreaterThanOrEqual(0)
      expect(st.points[i + 1]).toBeLessThanOrEqual(600)
    }
  })
})
