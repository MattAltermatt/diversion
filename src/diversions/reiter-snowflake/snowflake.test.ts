import { describe, it, expect } from 'vitest'
import {
  createSnowState, stepSnow, tickLifecycle, effectiveParams, buildLUT,
} from './snowflake'
import type { ReiterSnowflakeConfig } from './schema'

const cfg = (over: Partial<ReiterSnowflakeConfig> = {}): ReiterSnowflakeConfig => ({
  spread: 1.0, humidity: 0.5, sharpness: 0.0012, speed: 3, detail: 41, hold: 5, seed: 1,
  stops: ['#05070f', '#123a63', '#4fb3e8', '#eafcff'],
  ...over,
})

const frozenCount = (s: Float32Array): number => {
  let n = 0
  for (let i = 0; i < s.length; i++) if (s[i] >= 1) n++
  return n
}

describe('effectiveParams', () => {
  it('is deterministic per seed and stays in the viable bands', () => {
    const a = effectiveParams(cfg(), 7)
    expect(effectiveParams(cfg(), 7)).toEqual(a)
    expect(a.alpha).toBeGreaterThanOrEqual(0.6); expect(a.alpha).toBeLessThanOrEqual(2.4)
    expect(a.beta).toBeGreaterThanOrEqual(0.3); expect(a.beta).toBeLessThanOrEqual(0.9)
    expect(a.gamma).toBeGreaterThan(0)
  })
  it('varies across seeds', () => {
    expect(effectiveParams(cfg(), 7)).not.toEqual(effectiveParams(cfg(), 8))
  })
})

describe('buildLUT', () => {
  it('maps vapor (low value) to background and frozen (high) to a bright ramp', () => {
    const { lut, bg } = buildLUT(['#000000', '#ffffff'])
    expect(lut[0]).toBe(bg[0])                 // value 0 → background
    expect(lut[255 * 4]).toBeGreaterThan(bg[0]) // value VMAX → bright
    expect(lut[3]).toBe(255)                   // opaque
  })
})

describe('stepSnow — Reiter growth', () => {
  it('seeds a single frozen centre that grows outward', () => {
    const st = createSnowState(cfg({ detail: 41 }), 400, 300)
    expect(frozenCount(st.s)).toBe(1) // just the centre seed
    for (let k = 0; k < 120; k++) stepSnow(st)
    expect(frozenCount(st.s)).toBeGreaterThan(1) // crystal grew
  })
  it('is deterministic per seed', () => {
    const a = createSnowState(cfg({ detail: 41 }), 400, 300)
    const b = createSnowState(cfg({ detail: 41 }), 400, 300)
    for (let k = 0; k < 40; k++) { stepSnow(a); stepSnow(b) }
    expect([...a.s]).toEqual([...b.s])
  })
})

describe('tickLifecycle', () => {
  it('holds a filled crystal then reseeds after the hold elapses', () => {
    const st = createSnowState(cfg({ hold: 5 }), 400, 300)
    st.filled = true
    tickLifecycle(st, 16) // grow → hold
    expect(st.phase).toBe('hold')
    tickLifecycle(st, 6000) // past the 5 s hold → melt + regrow
    expect(st.reseeds).toBe(1)
    expect(st.phase).toBe('grow')
  })
})
