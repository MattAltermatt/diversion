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

// ── #294 wheel policy + #295 pinch ───────────────────────────────────────────
describe('swarm-chemistry camera — wheel policy and pinch (#294, #295)', () => {
  let cv: HTMLCanvasElement
  let state: CamState
  const attach = (yieldTouch = true) => {
    cv = makeCanvas(true)
    // The framework grants `touch-action: none` on Play; the Config preview below
    // 820px deliberately does not, and that is what canPinch reads back.
    if (yieldTouch) cv.style.touchAction = 'none'
    state = makeState()
    attachCamera(cv, state as never)
  }

  const wheelAt = (deltaY: number, ctrlKey = false, x = 400, y = 300) =>
    new WheelEvent('wheel', { deltaY, clientX: x, clientY: y, ctrlKey, cancelable: true, bubbles: true })
  const touch = (type: string, x: number, y: number, pointerId: number) =>
    new PointerEvent(type, {
      clientX: x, clientY: y, pointerId, pointerType: 'touch',
      isPrimary: pointerId === 1, bubbles: true,
    })

  /** jsdom reports 0 for every layout box, so a scrollable page has to be stated. */
  const withPageScroll = (run: () => void) => {
    const el = document.documentElement
    const sh = Object.getOwnPropertyDescriptor(el, 'scrollHeight')
    const ch = Object.getOwnPropertyDescriptor(el, 'clientHeight')
    Object.defineProperty(el, 'scrollHeight', { value: 3612, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 800, configurable: true })
    try { run() } finally {
      if (sh) Object.defineProperty(el, 'scrollHeight', sh)
      else delete (el as unknown as Record<string, unknown>).scrollHeight
      if (ch) Object.defineProperty(el, 'clientHeight', ch)
      else delete (el as unknown as Record<string, unknown>).clientHeight
    }
  }

  it('consumes the wheel where nothing behind the canvas scrolls (Play)', () => {
    attach()
    const e = wheelAt(-600)
    cv.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(state.cam.zoom).toBeGreaterThan(1)
  })

  it('DECLINES a plain wheel over a scrolling page — the #294 bug', () => {
    attach()
    withPageScroll(() => {
      const e = wheelAt(-600)
      cv.dispatchEvent(e)
      expect(e.defaultPrevented, 'ate the page scroll').toBe(false)
      expect(state.cam.zoom).toBe(1)
    })
  })

  it('still zooms there when the wheel carries ctrl — i.e. a trackpad pinch', () => {
    attach()
    withPageScroll(() => {
      const e = wheelAt(-600, true)
      cv.dispatchEvent(e)
      expect(e.defaultPrevented).toBe(true)
      expect(state.cam.zoom).toBeGreaterThan(1)
    })
  })

  it('zooms on a two-finger pinch where the framework took the gesture', () => {
    attach()
    cv.dispatchEvent(touch('pointerdown', 300, 300, 1))
    cv.dispatchEvent(touch('pointerdown', 500, 300, 2))
    cv.dispatchEvent(touch('pointermove', 600, 300, 2)) // span 200 -> 300
    expect(state.cam.zoom).toBeCloseTo(1.5, 6)
    expect(Number.isFinite(state.cam.panX)).toBe(true)
    expect(Number.isFinite(state.cam.panY)).toBe(true)
  })

  it('does not pinch where the browser still owns touch (Config preview <820px)', () => {
    attach(false)
    cv.dispatchEvent(touch('pointerdown', 300, 300, 1))
    cv.dispatchEvent(touch('pointerdown', 500, 300, 2))
    cv.dispatchEvent(touch('pointermove', 600, 300, 2))
    expect(state.cam.zoom).toBe(1)
  })

  it('does not pan while a multi-finger gesture is in flight', () => {
    // Three fingers: no stable pair to measure, so the pinch idles — and the drag
    // must stay disarmed rather than quietly resuming. A pan here would chase one
    // finger while the other two moved.
    attach()
    cv.dispatchEvent(touch('pointerdown', 300, 300, 1))
    cv.dispatchEvent(touch('pointermove', 320, 300, 1)) // a real one-finger pan
    const panned = state.cam.panX
    expect(panned, 'a zero pan would make the assertion below vacuous').not.toBe(0)
    cv.dispatchEvent(touch('pointerdown', 500, 300, 2))
    cv.dispatchEvent(touch('pointerdown', 700, 300, 3))
    cv.dispatchEvent(touch('pointermove', 100, 500, 1)) // finger 1 travels a long way
    expect(state.cam.panX).toBe(panned)
    expect(state.cam.zoom).toBe(1)
  })

  it('pans on a two-finger drag that does not change the span', () => {
    // Both fingers travel 120px together: the span is unchanged, so this is a pure
    // pan. Applying only the scale would make it a no-op — and it is the gesture a
    // phone viewer reaches for first.
    attach()
    cv.dispatchEvent(touch('pointerdown', 300, 300, 1))
    cv.dispatchEvent(touch('pointerdown', 500, 300, 2))
    cv.dispatchEvent(touch('pointermove', 420, 300, 1))
    cv.dispatchEvent(touch('pointermove', 620, 300, 2))
    expect(state.cam.zoom).toBeCloseTo(1, 6)
    expect(state.cam.panX).not.toBe(0)
    expect(Number.isFinite(state.cam.panX)).toBe(true)
  })

  it('switches from panning to pinching the moment a second finger lands', () => {
    // The threshold itself lives in `active()` and is pinned in canvasGestures.test.ts;
    // what this pins is the CONSUMER behaviour — an in-flight one-finger pan becomes a
    // zoom rather than continuing as a pan.
    attach()
    cv.dispatchEvent(touch('pointerdown', 300, 300, 1))
    cv.dispatchEvent(touch('pointermove', 320, 300, 1))
    const panned = state.cam.panX
    cv.dispatchEvent(touch('pointerdown', 500, 300, 2))
    // Finger 1 keeps moving; with only 2 fingers this must be the PINCH path (zoom
    // changes), never the drag path.
    cv.dispatchEvent(touch('pointermove', 200, 300, 1))
    expect(state.cam.zoom).not.toBe(1)
    expect(state.cam.panX).not.toBe(panned)
  })

  it('does NOT ratchet the zoom when two fingers pan at the minimum', () => {
    // The reason PinchStep.scale is absolute. Fingers travelling together do not move
    // in lockstep — pointermove fires per pointer — so the span wobbles down and back
    // up. Folding an INCREMENTAL ratio into an already-clamped zoom lets the clamp eat
    // the shrink halves while the grow halves apply, and a pure pan creeps inward.
    attach()
    expect(state.cam.zoom).toBe(1) // at the clamp, which is where it ratchets
    cv.dispatchEvent(touch('pointerdown', 300, 300, 1))
    cv.dispatchEvent(touch('pointerdown', 500, 300, 2)) // span 200
    let worst = 1
    for (let i = 0; i < 30; i++) {
      // wobble 200 -> 190 -> 200 -> ... while both fingers drift right
      cv.dispatchEvent(touch('pointermove', 300 + i * 4, 300, 1))
      cv.dispatchEvent(touch('pointermove', 500 + i * 4 + (i % 2 ? -10 : 0), 300, 2))
      worst = Math.max(worst, state.cam.zoom)
    }
    expect(worst).toBeCloseTo(1, 6)
    expect(state.cam.zoom).toBeCloseTo(1, 6)
  })

  it('still zooms for a REAL span change — the anti-ratchet test is not vacuous', () => {
    attach()
    cv.dispatchEvent(touch('pointerdown', 300, 300, 1))
    cv.dispatchEvent(touch('pointerdown', 500, 300, 2))
    cv.dispatchEvent(touch('pointermove', 900, 300, 2)) // span 200 -> 600
    expect(state.cam.zoom).toBeCloseTo(3, 6)
  })

  it('tracks the span ABSOLUTELY across a gesture — it does not compound', () => {
    // `step.scale` is measured against the span the pair started with, so the caller
    // must convert it to a target (pinchZoom0 * scale) rather than multiplying the
    // running zoom by it. Multiplying compounds: 2x then 3x would land on 6x.
    attach()
    cv.dispatchEvent(touch('pointerdown', 300, 300, 1))
    cv.dispatchEvent(touch('pointerdown', 500, 300, 2)) // span 200
    cv.dispatchEvent(touch('pointermove', 700, 300, 2)) // span 400 -> 2x
    expect(state.cam.zoom).toBeCloseTo(2, 6)
    cv.dispatchEvent(touch('pointermove', 900, 300, 2)) // span 600 -> 3x, NOT 6x
    expect(state.cam.zoom).toBeCloseTo(3, 6)
  })

  it('anchors each new pinch at the zoom it starts from', () => {
    // Latching pinchZoom0 on step.anchor is what makes a SECOND gesture relative to
    // where the first one left off. Without it every pinch restarts from 1x and the
    // view snaps back the instant two fingers touch down.
    attach()
    cv.dispatchEvent(touch('pointerdown', 300, 300, 1))
    cv.dispatchEvent(touch('pointerdown', 500, 300, 2))
    cv.dispatchEvent(touch('pointermove', 700, 300, 2)) // -> 2x
    cv.dispatchEvent(touch('pointerup', 700, 300, 2))
    cv.dispatchEvent(touch('pointerup', 300, 300, 1))
    expect(state.cam.zoom).toBeCloseTo(2, 6)

    // A fresh pinch, doubled again: 2x -> 4x, not back to 2x.
    cv.dispatchEvent(touch('pointerdown', 300, 300, 3))
    cv.dispatchEvent(touch('pointerdown', 500, 300, 4))
    cv.dispatchEvent(touch('pointermove', 700, 300, 4))
    expect(state.cam.zoom).toBeCloseTo(4, 6)
  })

  it('hands the pan back to the finger still down, re-seeded from where it IS', () => {
    attach()
    cv.dispatchEvent(touch('pointerdown', 300, 300, 1))
    cv.dispatchEvent(touch('pointerdown', 500, 300, 2))
    // BOTH fingers move during the pinch — finger 1 ends up 40px from where it was
    // pressed. That is what makes this test able to fail: keeping the `last` captured
    // at pointerdown would leave the handover reading 300 instead of 260, and the
    // move below would compute a zero delta.
    cv.dispatchEvent(touch('pointermove', 260, 300, 1))
    cv.dispatchEvent(touch('pointermove', 600, 300, 2))
    cv.dispatchEvent(touch('pointerup', 600, 300, 2))
    const before = state.cam.panX
    cv.dispatchEvent(touch('pointermove', 300, 300, 1))
    expect(state.cam.panX, 'the surviving finger did not resume the pan').not.toBe(before)
    expect(Number.isFinite(state.cam.panX)).toBe(true)
  })
})
