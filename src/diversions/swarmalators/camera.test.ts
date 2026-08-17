import { describe, it, expect, beforeEach } from 'vitest'
import { attachCamera } from './index'

// Sibling of particle-life-gpu/camera.test.ts — same two #290 defects, and this file
// exists separately because the sign conventions differ: swarmalators' world is
// free space with y flipped on screen, so its pan is `panY += dy` where Particle
// Life's is `panY -= dy`. One shared test could not have caught a swapped sign here.

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

type CamState = { cam: { zoom: number; panX: number; panY: number }; camDirty: boolean }
const makeState = (): CamState => ({ cam: { zoom: 1, panX: 0, panY: 0 }, camDirty: false })

/** No movementX/movementY — what a touch pointer looks like where this broke. */
const ptr = (type: string, x: number, y: number, isPrimary = true, pointerId = 1) =>
  new PointerEvent(type, { clientX: x, clientY: y, isPrimary, pointerId, bubbles: true })
const wheel = (deltaY: number) =>
  new WheelEvent('wheel', { deltaY, clientX: 400, clientY: 300, cancelable: true, bubbles: true })

describe('swarmalators camera (#290)', () => {
  let cv: HTMLCanvasElement
  let state: CamState
  let detach: () => void
  const attach = (interactive = true) => {
    cv = makeCanvas(interactive)
    state = makeState()
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
  })

  it('keeps its INVERTED panY sign — dragging down moves the view up', () => {
    // Guards the one line that differs from the Particle Life sibling. Free space
    // flips y on screen, so a downward drag must increase panY, not decrease it.
    cv.dispatchEvent(wheel(-600))
    cv.dispatchEvent(ptr('pointerdown', 400, 300))
    cv.dispatchEvent(ptr('pointermove', 400, 400))
    expect(state.cam.panY).toBeGreaterThan(0)
    expect(state.cam.panX).toBe(0)
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
describe('swarmalators camera — wheel policy and pinch (#294, #295)', () => {
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

  it('pinches about a point the SAME way the wheel zooms about it (sign check)', () => {
    // The one place a mis-wired pinch would hide: this world is y-up, so a pinch that
    // fed the transform with a flipped midpoint would still zoom, just about the
    // wrong point. Compare against the wheel, which is covered above.
    attach()
    cv.dispatchEvent(wheelAt(-Math.log(1.5) / 0.0015, false, 300, 200))
    const viaWheel = { ...state.cam }

    attach()
    cv.dispatchEvent(touch('pointerdown', 200, 200, 1))
    cv.dispatchEvent(touch('pointerdown', 400, 200, 2)) // midpoint (300, 200), span 200
    cv.dispatchEvent(touch('pointermove', 500, 200, 2)) // span 300 -> 1.5x, midpoint (350,200)
    // Same factor about a nearby point: the pan must land on the same side, not mirrored.
    expect(state.cam.zoom).toBeCloseTo(viaWheel.zoom, 6)
    expect(Math.sign(state.cam.panY)).toBe(Math.sign(viaWheel.panY))
  })
})
