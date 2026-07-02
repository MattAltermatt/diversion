import { describe, it, expect } from 'vitest'
import { createNavGrid, rebuildFields, sampleField, losClear, NAV_CELL, type NavGrid } from './navField'
import { generateArena, type Arena } from './arena'

const W = 1600, H = 900
const CIV = 0, ZOM = 2

// Minimal Ecosystem-shaped stub: [x, y, faction] triples.
function eco(pts: [number, number, number][]) {
  return {
    n: pts.length,
    px: Float32Array.from(pts.map((p) => p[0])),
    py: Float32Array.from(pts.map((p) => p[1])),
    faction: Uint8Array.from(pts.map((p) => p[2])),
    alive: Uint8Array.from(pts.map(() => 1)),
  }
}
const cellIdx = (nav: NavGrid, x: number, y: number) =>
  Math.floor(y / NAV_CELL) * nav.cols + Math.floor(x / NAV_CELL)

describe('navField', () => {
  it('humanDist is 0 at a human cell and grows with distance (open arena)', () => {
    const a = generateArena(1, 0, W, H)
    const nav = createNavGrid(a, W, H)
    rebuildFields(nav, eco([[300, 450, CIV]]), ZOM)
    expect(nav.humanDist[cellIdx(nav, 300, 450)]).toBe(0)
    expect(nav.humanDist[cellIdx(nav, 500, 450)]).toBeGreaterThan(nav.humanDist[cellIdx(nav, 360, 450)])
  })

  it('sampleField descend points toward the human', () => {
    const a = generateArena(1, 0, W, H)
    const nav = createNavGrid(a, W, H)
    rebuildFields(nav, eco([[300, 450, CIV]]), ZOM)
    const out = new Float32Array(2)
    expect(sampleField(nav, nav.humanDist, 600, 450, true, out)).toBe(true)
    expect(out[0]).toBeLessThan(0) // move -x, toward the human at x=300
  })

  it('sampleField ascend (flee) points away from the zombie', () => {
    const a = generateArena(1, 0, W, H)
    const nav = createNavGrid(a, W, H)
    rebuildFields(nav, eco([[300, 450, ZOM]]), ZOM)
    const out = new Float32Array(2)
    expect(sampleField(nav, nav.zombieDist, 600, 450, false, out)).toBe(true)
    expect(out[0]).toBeGreaterThan(0) // move +x, away from the zombie at x=300
  })

  it('a field with no sources is INF everywhere → sampleField returns false', () => {
    const a = generateArena(1, 0, W, H)
    const nav = createNavGrid(a, W, H)
    rebuildFields(nav, eco([[300, 450, CIV]]), ZOM) // no zombies at all
    const out = new Float32Array(2)
    expect(sampleField(nav, nav.zombieDist, 600, 450, false, out)).toBe(false)
  })

  it('losClear is false through a wall and true across open space', () => {
    const a: Arena = { walls: [{ x: 400, y: 400, w: 100, h: 100 }] }
    expect(losClear(a, 350, 450, 600, 450)).toBe(false) // crosses the wall
    expect(losClear(a, 100, 100, 300, 100)).toBe(true) // open
  })

  it('routes around a wall: descend picks a walkable neighbour, never a blocked one', () => {
    // A vertical wall with a gap; a chaser below the gap should be steered along the field,
    // and sampleField must never return a direction into the wall cell.
    const a = generateArena(9, 1, W, H)
    const nav = createNavGrid(a, W, H)
    rebuildFields(nav, eco([[300, 450, CIV]]), ZOM)
    const out = new Float32Array(2)
    for (let k = 0; k < 200; k++) {
      const x = 300 + (k % 20) * 50, y = 100 + Math.floor(k / 20) * 80
      if (sampleField(nav, nav.humanDist, x, y, true, out)) {
        const nx = x + out[0] * NAV_CELL, ny = y + out[1] * NAV_CELL
        const ci = cellIdx(nav, Math.max(0, Math.min(W - 1, nx)), Math.max(0, Math.min(H - 1, ny)))
        expect(nav.blocked[ci]).toBe(0)
      }
    }
  })
})
