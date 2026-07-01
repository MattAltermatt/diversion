import { describe, it, expect, vi } from 'vitest'
import swarmalators from './index'
import { swarmalatorsSchema } from './schema'

// Regression guard for the "edits don't apply live" gotcha: update() must re-upload the
// right buffer when a live field changes (else hand-tuning never reaches the GPU), and
// return false for structural fields (count/seed) so the framework re-runs setup(). We
// drive the real update() with a fake GpuResources whose writeBuffer is a spy.

function mockState(cfg: unknown) {
  const res = {
    device: { queue: { writeBuffer: vi.fn() } },
    dpr: 1, bg: { r: 0, g: 0, b: 0 },
    paramsBuf: { t: 'params' }, viewBuf: { t: 'view' }, fadeBuf: { t: 'fade' },
    omegaBuf: {}, posBuf: {}, phaseBuf: {}, velBuf: {}, phaseVelBuf: {},
  }
  const state = {
    cfg, size: { width: 800, height: 600 }, res, ready: true, disposed: false,
    acc: 0, cam: { zoom: 1, panX: 0, panY: 0 }, camDirty: false, detach: null,
  }
  return { state, res }
}
const wroteBuffers = (res: ReturnType<typeof mockState>['res']) =>
  res.device.queue.writeBuffer.mock.calls.map((c: unknown[]) => c[0])

const base = swarmalatorsSchema.parse({})
const size = { width: 800, height: 600 }

describe('swarmalators update() — live apply routing', () => {
  it('count change is structural (returns false → re-setup)', () => {
    const { state } = mockState(base)
    expect(swarmalators.update!(state as never, { ...base, count: base.count + 500 }, size)).toBe(false)
  })
  it('seed change is structural', () => {
    const { state } = mockState(base)
    expect(swarmalators.update!(state as never, { ...base, seed: 99 }, size)).toBe(false)
  })
  it('a J/K/shimmer change writes the params buffer (live)', () => {
    const { state, res } = mockState(base)
    const applied = swarmalators.update!(state as never, { ...base, K: -0.1 }, size)
    expect(applied).toBe(true)
    expect(wroteBuffers(res)).toContain(res.paramsBuf)
  })
  it('a colorMap change writes the view buffer (live)', () => {
    const { state, res } = mockState(base)
    swarmalators.update!(state as never, { ...base, colorMap: 'Sinebow' }, size)
    expect(wroteBuffers(res)).toContain(res.viewBuf)
  })
  it('a trailFade change writes the fade buffer, not params', () => {
    const { state, res } = mockState(base)
    swarmalators.update!(state as never, { ...base, trailFade: 0.4 }, size)
    expect(wroteBuffers(res)).toContain(res.fadeBuf)
    expect(wroteBuffers(res)).not.toContain(res.paramsBuf)
  })
})
