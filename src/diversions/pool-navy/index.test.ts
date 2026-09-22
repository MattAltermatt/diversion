import { describe, expect, it } from 'vitest'
import { make2DContext } from '../../test-setup'
import { poolNavySchema } from './schema'
import { step, type PoolNavyState } from './sim'
import diversion from './index'

const SIZE = { width: 400, height: 300 }
const cfg = poolNavySchema.parse({ seed: 5 })

describe('pool-navy framework seam', () => {
  // ⭐ ⚠️ The spec's §11 calls this "the one that will silently break
  // everything": `dt` is MILLISECONDS and the sim works in SECONDS. Deleting
  // the /1000 left the entire 108-test suite green while the piece ran 1000x
  // too fast, because every other test drives `step()` directly in seconds and
  // never goes through the hook.
  it('frame() converts MILLISECONDS to seconds exactly once', () => {
    const ctx = make2DContext()
    const viaFrame = diversion.setup(ctx, cfg, SIZE) as PoolNavyState
    const viaStep = diversion.setup(ctx, cfg, SIZE) as PoolNavyState

    for (let i = 0; i < 120; i++) {
      diversion.frame(viaFrame, ctx, i * 16, 16)
      step(viaStep, (16 / 1000) * cfg.tempo)
    }
    expect(viaFrame.t).toBeCloseTo(viaStep.t, 6)
    // 120 frames x 16 ms x tempo 0.6 = 1.152 s of world time, not 1152.
    expect(viaFrame.t).toBeGreaterThan(0.5)
    expect(viaFrame.t, 'a missing /1000 lands here in the hundreds').toBeLessThan(5)
  })

  it('tolerates dt === 0, which is how a paused piece repaints', () => {
    const ctx = make2DContext()
    const state = diversion.setup(ctx, cfg, SIZE) as PoolNavyState
    diversion.frame(state, ctx, 0, 16)
    const t = state.t
    expect(() => diversion.frame(state, ctx, 16, 0)).not.toThrow()
    expect(state.t, 'dt 0 must not advance the world').toBe(t)
    expect(ctx.calls.length).toBeGreaterThan(0)
  })

  it('tempo scales world time, and does not multiply the frameworks clock', () => {
    const ctx = make2DContext()
    const slow = diversion.setup(ctx, poolNavySchema.parse({ seed: 5, tempo: 0.3 }), SIZE) as PoolNavyState
    const fast = diversion.setup(ctx, poolNavySchema.parse({ seed: 5, tempo: 1.2 }), SIZE) as PoolNavyState
    for (let i = 0; i < 120; i++) {
      diversion.frame(slow, ctx, i * 16, 16)
      diversion.frame(fast, ctx, i * 16, 16)
    }
    expect(fast.t / slow.t).toBeCloseTo(4, 1)
  })
})
