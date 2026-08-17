import { describe, it, expect, beforeEach } from 'vitest'
import { attachCamera } from './index'
import { swarmChemistrySchema } from './schema'

// Sibling of particle-life-gpu/camera.test.ts — same two #290 defects. This one is
// separate because swarm-chemistry's scale reads `state.res`, the GPU resources,
// which are NULL until the async device tail resolves. Every camera gesture is
// reachable during that window, so the pre-ready fallback is a real code path.

function makeCanvas(interactive: boolean): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = 1600
  cv.height = 1200
  cv.setAttribute('data-interactive', interactive ? 'true' : 'false')
  cv.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }) as DOMRect
  cv.setPointerCapture = () => {}
  cv.hasPointerCapture = () => true
  cv.releasePointerCapture = () => {}
  return cv
}

type CamState = {
  cfg: unknown
  res: { arenaW: number; arenaH: number } | null
  cam: { zoom: number; panX: number; panY: number }
  camDirty: boolean
}
const makeState = (res: CamState['res'] = null): CamState => ({
  cfg: swarmChemistrySchema.parse({}),
  res,
  cam: { zoom: 1, panX: 0, panY: 0 },
  camDirty: false,
})

/** No movementX/movementY — what a touch pointer looks like where this broke. */
const ptr = (type: string, x: number, y: number, isPrimary = true, pointerId = 1) =>
  new PointerEvent(type, { clientX: x, clientY: y, isPrimary, pointerId, bubbles: true })
const wheel = (deltaY: number) =>
  new WheelEvent('wheel', { deltaY, clientX: 400, clientY: 300, cancelable: true, bubbles: true })

describe('swarm-chemistry camera (#290)', () => {
  let cv: HTMLCanvasElement
  let state: CamState
  let detach: () => void
  const attach = (interactive = true, res: CamState['res'] = { arenaW: 900, arenaH: 900 }) => {
    cv = makeCanvas(interactive)
    state = makeState(res)
    detach = attachCamera(cv, state as never)
  }
  beforeEach(() => attach())

  it('pans from CLIENT deltas, never NaN from a missing movementX', () => {
    cv.dispatchEvent(wheel(-600))
    cv.dispatchEvent(ptr('pointerdown', 400, 300))
    cv.dispatchEvent(ptr('pointermove', 500, 360))
    cv.dispatchEvent(ptr('pointerup', 500, 360))
    expect(Number.isFinite(state.cam.panX)).toBe(true)
    expect(Number.isFinite(state.cam.panY)).toBe(true)
    expect(state.cam.panX).not.toBe(0)
    expect(state.cam.panY).not.toBe(0)
  })

  it('stays finite when dragged BEFORE the GPU device resolves (res === null)', () => {
    // setup() attaches the camera synchronously but `res` fills in from an async
    // tail, so this window is reachable by a real drag on a slow device.
    detach()
    attach(true, null)
    cv.dispatchEvent(wheel(-600))
    cv.dispatchEvent(ptr('pointerdown', 400, 300))
    cv.dispatchEvent(ptr('pointermove', 520, 380))
    expect(Number.isFinite(state.cam.panX)).toBe(true)
    expect(Number.isFinite(state.cam.panY)).toBe(true)
    expect(Number.isFinite(state.cam.zoom)).toBe(true)
  })

  it('accumulates equal increments across a multi-step drag', () => {
    cv.dispatchEvent(wheel(-600))
    cv.dispatchEvent(ptr('pointerdown', 400, 300))
    cv.dispatchEvent(ptr('pointermove', 440, 300))
    const one = state.cam.panX
    expect(one, 'a zero increment would make the comparison below vacuous').not.toBe(0)
    cv.dispatchEvent(ptr('pointermove', 480, 300))
    expect(state.cam.panX - one).toBeCloseTo(one, 6)
  })

  it('ignores a non-primary pointer', () => {
    cv.dispatchEvent(wheel(-600))
    cv.dispatchEvent(ptr('pointerdown', 400, 300))
    cv.dispatchEvent(ptr('pointermove', 500, 300))
    const after = state.cam.panX
    cv.dispatchEvent(ptr('pointermove', 200, 300, false, 2))
    expect(state.cam.panX).toBe(after)
  })

  it('does not consume the wheel on a gallery tile', () => {
    detach()
    attach(false)
    const e = wheel(-240)
    cv.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    expect(state.cam.zoom).toBe(1)
  })

  it('does not reset a gallery tile on double-click', () => {
    detach()
    attach(false)
    state.cam = { zoom: 4, panX: 1, panY: 1 }
    cv.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(state.cam.zoom).toBe(4)
  })

  it('survives pointercancel without throwing', () => {
    cv.dispatchEvent(ptr('pointerdown', 400, 300))
    expect(() => cv.dispatchEvent(ptr('pointercancel', 400, 300))).not.toThrow()
  })
})
