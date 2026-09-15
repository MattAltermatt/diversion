import { describe, it, expect } from 'vitest'
import { parquetSchema, type ParquetConfig } from './schema'
import { deformationPresets, palettePresets } from './presets'
import {
  createState, buildLut, rebuildStack, setLut, structural, renderParquet, modeColors, contrast,
} from './render'

const cfg = parquetSchema.parse({})

const fakeCtx = () => {
  const calls: string[] = []
  const fillRules: unknown[] = []
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', lineCap: '',
    fillRect: () => calls.push('fillRect'),
    beginPath: () => calls.push('beginPath'),
    moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    fill: (r?: unknown) => { calls.push('fill'); fillRules.push(r) },
    stroke: () => calls.push('stroke'),
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls, fillRules }
}

describe('structural', () => {
  it('is false for a detail change — Detail must never re-simulate', () => {
    expect(structural(cfg, { ...cfg, detail: 44 })).toBe(false)
  })

  it('is false for every live-applied field', () => {
    const patches: Partial<ParquetConfig>[] = [
      { amplitude: 0.9 }, { field: 'Radial' }, { rampWidth: 22 }, { drift: 3 },
      { tileSize: 60 }, { renderMode: 'Line' }, { lineWidth: 3 }, { tileA: '#ffffff' },
      { rampMapping: 'Whole stack' },
    ]
    for (const patch of patches) {
      expect(structural(cfg, { ...cfg, ...patch }), JSON.stringify(patch)).toBe(false)
    }
  })

  it('is true for the three that change the keyframe stack', () => {
    expect(structural(cfg, { ...cfg, scheme: 'Fractal' })).toBe(true)
    expect(structural(cfg, { ...cfg, organicFamily: 'Wild' })).toBe(true)
    expect(structural(cfg, { ...cfg, seed: 99 })).toBe(true)
  })
})

describe('buildLut', () => {
  // An earlier version assigned st.lut by hand, so it passed against an
  // implementation that re-simulates on every Detail tick.
  it('a detail change rebuilds the LUT WITHOUT touching the stack', () => {
    const st = createState(cfg, 800, 600)
    const stackRef = st.stack
    const frameRef = st.stack[3]
    const before = Array.from(st.lut[st.lut.length - 1])
    setLut(st, buildLut(st, { ...cfg, detail: 4 }))
    expect(st.stack).toBe(stackRef) // same array object
    expect(st.stack[3]).toBe(frameRef) // same curve objects
    expect(Array.from(st.lut[st.lut.length - 1])).not.toEqual(before)
  })

  // Every scheme must have a live Detail slider. An earlier fractal branch
  // returned 6 keyframes against a min of 6, so all 43 positions were identical.
  for (const scheme of ['Organic', 'Grid keys', 'Fractal'] as const) {
    it(`detail moves the far end of the ramp under ${scheme}`, () => {
      const c = { ...cfg, scheme }
      const st = createState(c, 800, 600)
      const lo = buildLut(st, { ...c, detail: 4 })
      const hi = buildLut(st, { ...c, detail: 48 })
      expect(Array.from(lo[lo.length - 1])).not.toEqual(Array.from(hi[hi.length - 1]))
    })
  }

  it('the knee mapping reaches a different far end than the whole stack', () => {
    const st = createState(cfg, 800, 600)
    const knee = buildLut(st, { ...cfg, rampMapping: 'To the knee' })
    const whole = buildLut(st, { ...cfg, rampMapping: 'Whole stack' })
    expect(Array.from(knee[knee.length - 1])).not.toEqual(Array.from(whole[whole.length - 1]))
  })

  it('setLut bumps the generation, which is what invalidates the cache', () => {
    const st = createState(cfg, 800, 600)
    const g = st.lutGen
    setLut(st, buildLut(st, { ...cfg, detail: 8 }))
    expect(st.lutGen).toBe(g + 1)
  })
})

// A tile's shape only redraws when its ROUNDED LUT index changes, so the travel
// between adjacent LUT entries IS the granularity of visible motion. A fixed
// 256-entry LUT gave organic 0.21 px steps and the grid presets 2.7-4.9 px — the
// owner saw the latter as "quick, sudden movement all over" even after the phase
// rate was normalised, because slowing it makes the jumps rarer, not smaller.
describe('motion granularity', () => {
  // ⚠️ Step by `q`, not by 1. `curveIdx` snaps to every q-th LUT entry
  // (q = floor(MAX_TILE / tileSize)), so the shape jump a viewer actually sees
  // is the q-spaced one. Measuring adjacent entries reported 0.31 px where the
  // renderer was doing 0.61 px — the guard looked like it had 3x headroom when
  // it had 1.4x, and its worst-case list pinned tileSize 170, the ONE size where
  // q === 1 and the coarsening is inactive.
  const worstStepPx = (c: ParquetConfig): number => {
    const st = createState(c, 1600, 880)
    const q = Math.max(1, Math.floor(170 / c.tileSize))
    let mx = 0
    for (let i = q; i < st.lut.length; i += q) {
      const a = st.lut[i - q]
      const b = st.lut[i]
      for (let k = 0; k < a.length; k += 2) {
        const d = Math.hypot(b[k] - a[k], b[k + 1] - a[k + 1])
        if (d > mx) mx = d
      }
    }
    return mx * c.tileSize
  }

  for (const p of deformationPresets) {
    it(`${p.name} steps sub-pixel`, () => {
      expect(worstStepPx({ ...cfg, ...p.patch })).toBeLessThan(1)
    })
  }

  // The configurations that demand the most LUT resolution. Both sit against the
  // 4096 cap, so if a future scheme travels further it gets coarser SILENTLY —
  // this is the guard that makes that loud instead.
  it('holds on the worst configurations the sliders can reach', () => {
    // Spans the tile-size range deliberately: 170 is where q === 1 and the LUT
    // does all the work, 110 and 34 are where the coarsening is live.
    const worstCases: Partial<ParquetConfig>[] = [
      { scheme: 'Organic', rampMapping: 'Whole stack', detail: 48, amplitude: 2, tileSize: 170 },
      { scheme: 'Organic', rampMapping: 'Whole stack', detail: 48, amplitude: 2, tileSize: 110 },
      { scheme: 'Grid keys', detail: 48, rampWidth: 3, tileSize: 170 },
      { scheme: 'Grid keys', detail: 48, rampWidth: 3, tileSize: 110 },
      { scheme: 'Grid keys', detail: 48, amplitude: 2, tileSize: 34 },
    ]
    for (const patch of worstCases) {
      const px = worstStepPx({ ...cfg, ...patch })
      expect(px, JSON.stringify(patch)).toBeLessThan(1)
    }
  }, 60000)
})

describe('renderParquet', () => {
  it('draws without throwing, and never constructs a Path2D', () => {
    expect(typeof (globalThis as { Path2D?: unknown }).Path2D).toBe('undefined')
    const st = createState(cfg, 600, 400)
    const { ctx, calls } = fakeCtx()
    expect(() => renderParquet(st, ctx)).not.toThrow()
    expect(calls[0]).toBe('fillRect')
    expect(calls.filter((c) => c === 'fill').length).toBeGreaterThan(0)
  })

  it('fills with an explicit nonzero winding rule', () => {
    // A self-overlapping tile under 'evenodd' shows background through its own
    // middle. The amplitude slider reaches a regime where tiles do overlap, and
    // that is accepted as an interlock — but only under nonzero.
    const st = createState({ ...cfg, amplitude: 2 }, 400, 300)
    const { ctx, fillRules } = fakeCtx()
    renderParquet(st, ctx)
    expect(fillRules.length).toBeGreaterThan(0)
    expect(new Set(fillRules)).toEqual(new Set(['nonzero']))
  })

  // The column collapse exists ONLY at phase 0, because the swing term tilts the
  // Ramp axis. Testing the cache at the default phase of 0 would certify a
  // property the running piece has at exactly one instant.
  it('collapses a column to one outline at phase 0 only', () => {
    const st = createState(cfg, 600, 400)
    const { ctx } = fakeCtx()
    const cols = Math.ceil(600 / cfg.tileSize) + 3 // loop runs i = -1 .. cols-1
    renderParquet(st, ctx)
    expect(st.outlines.size).toBe(cols)

    st.phase = 2.0
    renderParquet(st, ctx)
    renderParquet(st, ctx)
    expect(st.outlines.size).toBeGreaterThan(cols) // the tilt is real
  })

  // Reuse is a function of how finely the index is quantised, which is
  // q = floor(MAX_TILE / tileSize). At the default tile size q is 1, so the
  // index is at full LUT resolution and reuse is modest (measured ~46%); at
  // small tile sizes — where there are 7x more tiles and it actually matters —
  // q rises and reuse is strong. Assert both rather than one flattering number.
  const reuse = (tileSize: number) => {
    const st = createState({ ...cfg, tileSize }, 1200, 800)
    const { ctx } = fakeCtx()
    st.phase = 2.0
    renderParquet(st, ctx)
    const cold = st.builtThisFrame
    st.phase = 2.0 + 0.021 / 60 // one frame at the shipped Speed
    renderParquet(st, ctx)
    return { cold, warm: st.builtThisFrame }
  }

  it('the cache SURVIVES a frame at the default tile size', () => {
    const { cold, warm } = reuse(cfg.tileSize)
    expect(cold).toBeGreaterThan(20) // the first frame IS cold
    expect(warm).toBeLessThan(cold * 0.75)
  })

  it('and reuses far more at small tile sizes, where the tile count is high', () => {
    const { cold, warm } = reuse(34)
    expect(cold).toBeGreaterThan(200)
    expect(warm).toBeLessThan(cold * 0.3)
  })

  it('a LUT change invalidates the cache — Detail is not inert on screen', () => {
    const st = createState(cfg, 600, 400)
    const { ctx } = fakeCtx()
    renderParquet(st, ctx)
    const keysBefore = new Set(st.outlines.keys())
    setLut(st, buildLut(st, { ...cfg, detail: 8 }))
    st.cfg = { ...cfg, detail: 8 }
    renderParquet(st, ctx)
    expect(st.builtThisFrame).toBeGreaterThan(0) // it really redrew
    for (const k of st.outlines.keys()) expect(keysBefore.has(k)).toBe(false)
  })

  it('amplitude and tile size are NOT in the key — they are dropped instead', () => {
    const st = createState(cfg, 600, 400)
    const { ctx } = fakeCtx()
    renderParquet(st, ctx)
    const key = [...st.outlines.keys()][0]
    expect(key.split(',').length).toBe(5) // b,r,t,l,lutGen — nothing else
  })

  it('rebuildStack replaces the stack and drops both cache generations', () => {
    const st = createState(cfg, 600, 400)
    const before = st.stack
    st.outlines.set('stale', new Float32Array(2))
    rebuildStack(st, { ...cfg, scheme: 'Fractal' })
    expect(st.stack).not.toBe(before)
    expect(st.outlines.has('stale')).toBe(false)
  })
})

// The guard that a review round showed was missing: a preset whose motion is so
// slow the piece reads as frozen. The spec's own bar is that a viewer sees the
// tiling "arrive somewhere else within a minute". An earlier `pace` multiplier
// took two shipped presets to 11- and 17-minute traverses — unrecoverable even
// at the Speed slider's maximum — and every one of the 90 tests still passed.
describe('traverse time', () => {
  const DRIFT_RATE = 0.0021
  const traverseSeconds = (drift: number) => 1 / (drift * DRIFT_RATE)

  it('a full traverse at the default Speed is under two minutes', () => {
    expect(traverseSeconds(cfg.drift)).toBeLessThan(120)
  })

  it('the Speed slider can reach a brisk traverse and a very slow one', () => {
    expect(traverseSeconds(40)).toBeLessThan(20)
    expect(traverseSeconds(1)).toBeGreaterThan(300)
  })

  // Every preset must traverse at the same rate for a given Speed: the phase
  // rate depends on `drift` alone, so no preset can be secretly frozen.
  it('no preset alters the traverse rate', () => {
    for (const p of deformationPresets) {
      expect(Object.keys(p.patch), p.name).not.toContain('drift')
    }
  })
})

// The palettes and `renderMode` are independent axes, and only 'Fill + line' was
// authored against all six palettes. Measured before this guard: in Line mode
// three palettes — including the DEFAULT — put the stroke within 1.09:1 of the
// ground, so one click from the default produced a black screen.
describe('every palette reads in every render mode', () => {
  const modes = ['Fill + line', 'Fill', 'Line'] as const
  for (const pal of palettePresets) {
    for (const renderMode of modes) {
      it(`${pal.name} / ${renderMode}`, () => {
        const c: ParquetConfig = { ...cfg, ...pal.patch, renderMode }
        const m = modeColors(c)
        if (renderMode === 'Line') {
          // Nothing but strokes on the ground: WCAG 3:1 for a graphical object.
          expect(contrast(m.stroke, c.background)).toBeGreaterThanOrEqual(3)
        } else {
          // The tiling must read either by its two fills separating, or by the
          // edge being drawn over them.
          const fills = contrast(c.tileA, c.tileB)
          const edge = Math.min(contrast(m.stroke, c.tileA), contrast(m.stroke, c.tileB))
          expect(fills >= 1.5 || (m.strokeAlways && edge >= 3), `fills ${fills.toFixed(2)}`).toBe(true)
        }
      })
    }
  }
})
