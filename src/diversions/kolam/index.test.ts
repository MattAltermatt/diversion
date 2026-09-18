import { describe, it, expect } from 'vitest'
import { make2DContext } from '../../test-setup'
import kolam from './index'
import { DEFAULTS } from './config'

const size = { width: 800, height: 600 }
const cfg = () => ({ ...DEFAULTS })
const ctx = () => make2DContext() as unknown as CanvasRenderingContext2D

describe('kolam diversion', () => {
  it('spreads meta and WIRES THE PRESETS', () => {
    expect(kolam.id).toBe('kolam')
    expect(kolam.kind).toBe('2d')
    // ⚠️ Without this, deleting `presets: kolamPresets` leaves every other test
    // green — presetSweep filters on `d.presets` and skips an unwired diversion
    // in total silence, so the dropdowns simply never render.
    expect(kolam.presets).toHaveLength(2)
  })

  // ⚠️ The live set is SMALL and deliberately so. Stroke colour is baked at build
  // time and powder is rasterised into a persistent layer, so recolouring
  // mid-draw yields a drawing half one palette and half another that never heals.
  it('applies background live; every colour-bearing and structural field restarts', () => {
    const c = ctx()
    const st = kolam.setup(c, cfg(), size)
    expect(kolam.update!(st, { ...cfg(), penSpeed: 2 }, size)).toBeTruthy()
    expect(kolam.update!(st, { ...cfg(), background: '#3a2c22' }, size)).toBeTruthy()
    expect(kolam.update!(st, { ...cfg(), colouredChalk: 0.9 }, size)).toBeFalsy()
    expect(kolam.update!(st, { ...cfg(), symmetry: 12 }, size)).toBeFalsy()
    expect(kolam.update!(st, { ...cfg(), lineWidth: 3 }, size)).toBeFalsy()
  })

  it('treats dt as MILLISECONDS', () => {
    const c = ctx()
    const st = kolam.setup(c, cfg(), size)
    kolam.frame(st, c, 16, 16)
    // Cast at the READ, not at setup: casting the state narrows it and makes the
    // very next frame() call a type error.
    expect((st as { pen: { drawn: number } }).pen.drawn).toBeLessThan(200)
  })

  // ⚠️ Without shouldRestart the piece redraws the IDENTICAL picture forever:
  // a self-restart inside frame() does not re-roll the seed.
  it('holds, then asks the framework to reseed', () => {
    const c = ctx()
    const st = kolam.setup(c, { ...cfg(), holdSeconds: 0.1, penSpeed: 40 }, size)
    expect(kolam.shouldRestart!(st, 0, 16)).toBe(false)
    for (let i = 0; i < 6000; i++) kolam.frame(st, c, i * 16, 16)
    expect(kolam.shouldRestart!(st, 96000, 16)).toBe(true)
  }, 30000)
})
