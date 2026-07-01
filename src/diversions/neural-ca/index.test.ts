import { describe, it, expect, vi } from 'vitest'

// Mock the GL layer so we can drive frame() without a real WebGL2 context — we only
// care about the step-accumulator gating in index.ts, not the shaders.
vi.mock('./gl', async (importActual) => {
  const actual = await importActual<typeof import('./gl')>()
  return { ...actual, step: vi.fn(), render: vi.fn() }
})

import neuralCa from './index'
import { step, stepSeed } from './gl'

// #197: weights load async; step() no-ops until ready. If frame() advances stepIdx
// during that window, the "same seed" grows a different texture on a cold vs warm
// load (breaks the copy-link-with-seed keystone). Gate the accumulator on readiness.
describe('neural-ca frame gating (#197 seed-reproducibility keystone)', () => {
  const makeState = (ready: boolean) => ({
    gl: {} as WebGL2RenderingContext,
    res: { ready } as never,
    cfg: { speed: 1.5, seed: 42 } as never,
    acc: 0,
    stepIdx: 0,
  })

  it('does not advance stepIdx while weights are still loading', () => {
    vi.mocked(step).mockClear()
    const s = makeState(false)
    for (let i = 0; i < 20; i++) neuralCa.frame!(s as never, s.gl, i * 16, 16)
    expect(s.stepIdx).toBe(0)
    expect(s.acc).toBe(0)
    expect(step).not.toHaveBeenCalled()
  })

  it('first real step always uses stepIdx 0, regardless of how long the load took', () => {
    vi.mocked(step).mockClear()
    const s = makeState(false)
    // long "cold" load — many no-op frames elapse before ready flips
    for (let i = 0; i < 120; i++) neuralCa.frame!(s as never, s.gl, i * 16, 16)
    ;(s.res as { ready: boolean }).ready = true
    neuralCa.frame!(s as never, s.gl, 9999, 16)
    // seed of the first real step is stepSeed(seed, 0) — cold and warm loads match
    expect(vi.mocked(step).mock.calls[0][2]).toBe(stepSeed(42, 0))
  })
})
