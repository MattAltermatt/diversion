import { describe, it, expect } from 'vitest'
import { make2DContext } from '../../test-setup'
import kolam, { strokeWidthFor } from './index'
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
    // ⚠️ Truthy is not enough — it only means "I handled it, do not restart". An
    // earlier version asserted only that, so deleting the refreshGround() call
    // entirely left the suite green: the piece would swallow every background
    // change while telling the framework it applied them. Assert the ground
    // actually repainted.
    const keyBefore = (st as { layers: { groundKey: string } }).layers.groundKey
    expect(kolam.update!(st, { ...cfg(), background: '#3a2c22' }, size)).toBeTruthy()
    expect((st as { layers: { groundKey: string } }).layers.groundKey).not.toBe(keyBefore)
    // groundGrain is a 0-60 slider and the rebuild is ~225 ms, so it is
    // structural despite being cheap to describe.
    expect(kolam.update!(st, { ...cfg(), groundGrain: 40 }, size)).toBeFalsy()
    expect(kolam.update!(st, { ...cfg(), colouredChalk: 0.9 }, size)).toBeFalsy()
    expect(kolam.update!(st, { ...cfg(), symmetry: 12 }, size)).toBeFalsy()
    expect(kolam.update!(st, { ...cfg(), lineWidth: 3 }, size)).toBeFalsy()
  })

  // ⚠️ Nothing tested resize at all, which is how a one-argument mismatch shipped:
  // frame() composited into the SETUP box, so resize()'s centred composite was
  // overwritten on the very next frame and the drawing snapped to the top-left
  // behind a stale ground strip.
  it('keeps compositing at the LIVE size after a resize, not the setup size', () => {
    // ⚠️ Observe what composite RECEIVED, not a state field. Asserting `viewW`
    // is a proxy: the mutant changes what frame() PASSES, not what it stores, so
    // a state-only assertion stays green against it.
    const c = ctx()
    const calls: number[][] = []
    const rec = new Proxy(c, {
      get(t, k) {
        if (k === 'clearRect') return (...a: number[]) => { calls.push(a) }
        return Reflect.get(t, k)
      },
    }) as CanvasRenderingContext2D
    const st = kolam.setup(rec, cfg(), { width: 800, height: 600 })
    kolam.resize!(st, { width: 1200, height: 900 }, rec)
    calls.length = 0
    kolam.frame(st, rec, 16, 16)
    expect(calls[0]).toEqual([0, 0, 1200, 900])
  })

  // ⚠️ The gallery tile is the smallest surface this piece appears on, and it is
  // where a size-proportional stroke width fails: at 337 px the raw width is
  // 0.40 px at 0.46 alpha and the card reads as a grey rectangle. Nothing caught
  // that — every test ran at 800x600 or larger.
  it('keeps the stroke visible at gallery-tile scale', () => {
    const c = ctx()
    // Rmax = min(w,h) * 0.42 — a 337px tile gives 92, and the raw width there is
    // 0.44px at 0.46 alpha: the card read as a grey rectangle with a ghost of an
    // outline. Every other test ran at 800x600 or larger, so nothing saw it.
    const st = kolam.setup(c, cfg(), { width: 337, height: 220 }) as
      { comp: { Rmax: number } }
    expect(st.comp.Rmax).toBeLessThan(120)
    expect(strokeWidthFor(DEFAULTS.lineWidth, st.comp.Rmax)).toBeGreaterThanOrEqual(0.9)
    // …and the floor must NOT bind on a desktop canvas, or it would flatten the
    // Line width control everywhere.
    expect(strokeWidthFor(DEFAULTS.lineWidth, 378)).toBeCloseTo(1.8, 2)
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
