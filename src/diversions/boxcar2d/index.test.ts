import { describe, it, expect } from 'vitest'
import diversion from './index'
import { boxcar2dSchema } from './schema'

const SIZE = { width: 800, height: 600 }
const cfg = boxcar2dSchema.parse({})

/** Minimal headless 2D-context stub — frame() only issues canvas calls. */
function fakeCtx(): CanvasRenderingContext2D {
  const noop = () => {}
  return {
    createLinearGradient: () => ({ addColorStop: noop }),
    fillRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    arc: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    fillText: noop,
    fillStyle: '',
    strokeStyle: '',
    font: '',
    lineWidth: 1,
    textBaseline: 'top',
  } as unknown as CanvasRenderingContext2D
}

describe('boxcar2d diversion', () => {
  it('has the required contract fields', () => {
    expect(diversion.id).toBe('boxcar2d')
    expect(diversion.kind).toBe('2d')
    expect(diversion.schema).toBe(boxcar2dSchema)
    expect(diversion.presets?.length).toBeGreaterThan(0)
  })

  it('setup builds state and frame advances without throwing', () => {
    const s = diversion.setup(fakeCtx(), cfg, SIZE)
    expect(s).toBeTruthy()
    expect(s.current).toBeTruthy()
    for (let i = 0; i < 60; i++) diversion.frame(s, fakeCtx(), i * 16, 16)
    diversion.teardown?.(s)
  })

  it(
    'same seed → identical run through gen 3 (determinism keystone)',
    () => {
      // Capture both gen 1 (pre-breeding) AND gen 3 (after breeding + selection +
      // mutation, i.e. the post-setup rng stream) so a regression in the breed/
      // regen rng ordering can't slip past the assertion. A small population keeps
      // the multi-generation run fast; determinism is population-size-independent.
      // rough terrain so cars reliably get culled (the loop terminates fast);
      // small population keeps the multi-generation run quick. Determinism is
      // independent of both.
      const small = boxcar2dSchema.parse({ population: 6, roughness: 1.2 })
      const run = () => {
        const s = diversion.setup(fakeCtx(), small, SIZE)
        let guard = 0
        while (!s.thirdGenFitness && guard++ < 400000) {
          diversion.frame(s, fakeCtx(), guard * 16, 16)
        }
        const out = { first: s.firstGenFitness ?? [], third: s.thirdGenFitness ?? [] }
        diversion.teardown?.(s)
        return out
      }
      const a = run()
      const b = run()
      expect(a.first.length).toBe(small.population)
      expect(a.third.length).toBe(small.population)
      expect(a).toEqual(b)
    },
    30000,
  )
})
