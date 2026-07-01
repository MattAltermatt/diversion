import { describe, it, expect, vi } from 'vitest'
import particleLifeGpu from './index'
import { particleLifeGpuSchema } from './schema'
import { WORLD_W, WORLD_H } from './pack'

// Regression guard for the "matrix edits don't apply live" bug (#204): update()
// must re-upload the matrix buffer whenever cfg.matrix changes (a direct cell edit /
// Zero / Reset), not only on a symmetry/bias change — otherwise hand-tuning never
// reaches the GPU. We drive the real update() with a fake GpuResources whose
// writeBuffer is a spy, and assert which buffers it targets.

function mockState(cfg: unknown) {
  const res = {
    device: { queue: { writeBuffer: vi.fn() } },
    worldW: WORLD_W, worldH: WORLD_H, dpr: 1, bg: { r: 0, g: 0, b: 0 },
    paramsBuf: { t: 'params' }, matrixBuf: { t: 'matrix' }, viewBuf: { t: 'view' },
    fadeBuf: { t: 'fade' }, colorBuf: { t: 'color' }, speciesBuf: {}, posBuf: {}, velBuf: {},
  }
  const state = {
    cfg, size: { width: 800, height: 600 }, res, ready: true, disposed: false,
    acc: 0, cam: { zoom: 1, panX: 0, panY: 0 }, camDirty: false, detach: null,
  }
  return { state, res }
}
const wroteBuffers = (res: ReturnType<typeof mockState>['res']) =>
  res.device.queue.writeBuffer.mock.calls.map((c: unknown[]) => c[0])

describe('particle-life-gpu update() — live matrix apply', () => {
  it('re-uploads the matrix buffer when cfg.matrix changes (direct edit)', () => {
    const prev = particleLifeGpuSchema.parse({ colors: 3 })
    const { state, res } = mockState(prev)
    const next = { ...prev, matrix: new Array(9).fill(0.5) }
    const applied = particleLifeGpu.update!(state as never, next as never, state.size)
    expect(applied).toBe(true)
    expect(wroteBuffers(res)).toContain(res.matrixBuf)
  })

  it('does NOT re-upload the matrix when only an unrelated field changes', () => {
    const prev = { ...particleLifeGpuSchema.parse({ colors: 3 }), matrix: new Array(9).fill(0.2) }
    const { state, res } = mockState(prev)
    const next = { ...prev, dotSize: 4 } // matrix array reference is unchanged
    particleLifeGpu.update!(state as never, next as never, state.size)
    expect(wroteBuffers(res)).not.toContain(res.matrixBuf)
  })
})
