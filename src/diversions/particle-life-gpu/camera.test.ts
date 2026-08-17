import { describe, it, expect, beforeEach } from 'vitest'
import { attachCamera } from './index'
import { particleLifeGpuSchema } from './schema'

// This camera had NO tests, which is how two defects shipped and survived a Chrome
// verify (#290): a gallery TILE decided it was interactive from its own width and
// blocked page scroll, and the pan read `e.movementX`, which is absent for touch
// pointers on some engines — `panX -= undefined * n` is NaN, and clamping propagates
// NaN rather than correcting it, so one touch drag destroyed the view until reload.

/** A canvas that reports a real box, since jsdom's getBoundingClientRect is all zeros
 *  and the camera divides by `r.width`. 800x600 CSS, 1600x1200 backing store. */
function makeCanvas(interactive: boolean): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = 1600
  cv.height = 1200
  cv.setAttribute('data-interactive', interactive ? 'true' : 'false')
  cv.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }) as DOMRect
  // jsdom implements neither; the camera calls both.
  cv.setPointerCapture = () => {}
  cv.hasPointerCapture = () => true
  cv.releasePointerCapture = () => {}
  return cv
}

type CamState = { cfg: unknown; cam: { zoom: number; panX: number; panY: number }; camDirty: boolean }
const makeState = (): CamState => ({
  cfg: particleLifeGpuSchema.parse({}),
  cam: { zoom: 1, panX: 0, panY: 0 },
  camDirty: false,
})

/** A PointerEvent WITHOUT movementX/movementY — exactly what a touch pointer looks
 *  like on the engines where this broke. jsdom defaults them to 0, so building the
 *  event this way is what makes the regression reproducible in a unit test. */
const ptr = (type: string, x: number, y: number, isPrimary = true, pointerId = 1) =>
  new PointerEvent(type, { clientX: x, clientY: y, isPrimary, pointerId, bubbles: true })

const wheel = (deltaY: number, x = 400, y = 300) =>
  new WheelEvent('wheel', { deltaY, clientX: x, clientY: y, cancelable: true, bubbles: true })

describe('particle-life-gpu camera (#290)', () => {
  let cv: HTMLCanvasElement
  let state: CamState
  let detach: () => void

  const attach = (interactive = true) => {
    cv = makeCanvas(interactive)
    state = makeState()
    detach = attachCamera(cv, state as never)
  }

  beforeEach(() => attach())

  describe('when the host says this mount is viewer-driven', () => {
    it('pans from CLIENT deltas, with no movementX anywhere', () => {
      cv.dispatchEvent(wheel(-600)) // zoom in first, or clampPan pins pan to 0 at zoom 1
      const zoomed = state.cam.zoom
      expect(zoomed).toBeGreaterThan(1)

      cv.dispatchEvent(ptr('pointerdown', 400, 300))
      cv.dispatchEvent(ptr('pointermove', 500, 360))
      cv.dispatchEvent(ptr('pointerup', 500, 360))

      // The whole point: a real number, from an event carrying movementX === 0.
      expect(Number.isFinite(state.cam.panX)).toBe(true)
      expect(state.cam.panX).not.toBe(0)
      expect(state.cam.panY).not.toBe(0)
      expect(state.camDirty).toBe(true)
    })

    it('accumulates across a multi-step drag instead of re-measuring from the start', () => {
      cv.dispatchEvent(wheel(-600))
      cv.dispatchEvent(ptr('pointerdown', 400, 300))
      cv.dispatchEvent(ptr('pointermove', 440, 300))
      const afterOne = state.cam.panX
      expect(afterOne, 'a zero increment would make the comparison below vacuous').not.toBe(0)
      cv.dispatchEvent(ptr('pointermove', 480, 300))
      const afterTwo = state.cam.panX
      cv.dispatchEvent(ptr('pointerup', 480, 300))
      // Equal steps ⇒ equal increments. Tracking the ORIGIN instead of the previous
      // point would make the second increment twice the first.
      expect(afterTwo - afterOne).toBeCloseTo(afterOne - 0, 6)
    })

    it('ignores a second finger, which would otherwise fight the primary drag', () => {
      cv.dispatchEvent(wheel(-600))
      cv.dispatchEvent(ptr('pointerdown', 400, 300))
      cv.dispatchEvent(ptr('pointermove', 500, 300))
      const afterPrimary = state.cam.panX
      cv.dispatchEvent(ptr('pointermove', 200, 300, false, 2))
      expect(state.cam.panX).toBe(afterPrimary)
    })

    it('keeps the primary drag alive when a SECOND finger lifts', () => {
      // onUp accepted any pointerId, so on the full-bleed Play canvas — where both
      // fingers of an attempted pinch are over the canvas — finger 2's pointerup
      // ended finger 1's drag, which then stayed dead until it lifted and re-pressed.
      // Newly reachable on phones, because the camera used to be off below 480px.
      cv.dispatchEvent(wheel(-600))
      cv.dispatchEvent(ptr('pointerdown', 400, 300))
      cv.dispatchEvent(ptr('pointermove', 440, 300))
      const beforeSecondFinger = state.cam.panX

      cv.dispatchEvent(ptr('pointerup', 700, 500, false, 2)) // the other finger lifts

      cv.dispatchEvent(ptr('pointermove', 480, 300)) // primary keeps dragging
      expect(state.cam.panX).not.toBe(beforeSecondFinger)
    })

    it('does not pan on a RIGHT-button drag', () => {
      // `isPrimary` is true for a mouse whichever button is down, and Pointer Events
      // fire pointerdown for button 2 as well. So a reflexive right-click-drag
      // (looking for a context menu) panned the camera AND then popped the menu over
      // the shifted view.
      cv.dispatchEvent(wheel(-600))
      const down = new PointerEvent('pointerdown', {
        clientX: 400, clientY: 300, isPrimary: true, pointerId: 1,
        button: 2, buttons: 2, pointerType: 'mouse', bubbles: true,
      })
      cv.dispatchEvent(down)
      cv.dispatchEvent(new PointerEvent('pointermove', {
        clientX: 560, clientY: 300, isPrimary: true, pointerId: 1,
        button: -1, buttons: 2, pointerType: 'mouse', bubbles: true,
      }))
      expect(state.cam.panX).toBe(0)
    })

    it('declines a TOUCH drag while the browser still owns the gesture', () => {
      // The canvas only carries `touch-action: none` where the framework has opted
      // out of browser gestures. Below 820px the Config preview deliberately hands
      // them back (theme.css) because that page scrolls and the preview is sticky —
      // so panning there would fight the scroll the viewer actually asked for.
      // jsdom computes touchAction as 'auto' unless a test sets it, which is the retained case.
      cv.dispatchEvent(wheel(-600))
      cv.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: 400, clientY: 300, isPrimary: true, pointerId: 1,
        button: 0, buttons: 1, pointerType: 'touch', bubbles: true,
      }))
      cv.dispatchEvent(new PointerEvent('pointermove', {
        clientX: 560, clientY: 380, isPrimary: true, pointerId: 1,
        button: -1, buttons: 1, pointerType: 'touch', bubbles: true,
      }))
      expect(state.cam.panX).toBe(0)
      expect(state.cam.panY).toBe(0)
    })

    it('consumes the wheel, and a double-click resets', () => {
      const e = wheel(-240)
      cv.dispatchEvent(e)
      expect(e.defaultPrevented).toBe(true)
      expect(state.cam.zoom).toBeGreaterThan(1)

      cv.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      expect(state.cam).toEqual({ zoom: 1, panX: 0, panY: 0 })
    })

    it('survives a pointercancel mid-drag without throwing', () => {
      // pointercancel is the touch path; releasePointerCapture throws NotFoundError
      // for a pointer that is already inactive, which is why the call is guarded.
      cv.dispatchEvent(ptr('pointerdown', 400, 300))
      expect(() => cv.dispatchEvent(ptr('pointercancel', 400, 300))).not.toThrow()
      cv.dispatchEvent(ptr('pointermove', 600, 300))
      expect(state.cam.panX).toBe(0) // the drag really ended
    })
  })

  describe('when the host says this mount is a gallery tile', () => {
    beforeEach(() => {
      detach()
      attach(false)
    })

    it('does NOT consume the wheel — the #290 page-scroll hijack', () => {
      const e = wheel(-240)
      cv.dispatchEvent(e)
      expect(e.defaultPrevented).toBe(false)
      expect(state.cam.zoom).toBe(1)
    })

    it('does not pan, and does not reset on double-click', () => {
      cv.dispatchEvent(ptr('pointerdown', 400, 300))
      cv.dispatchEvent(ptr('pointermove', 600, 400))
      expect(state.cam.panX).toBe(0)

      state.cam = { zoom: 4, panX: 2, panY: 2 }
      cv.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      // dblclick was ungated before #290, so a double-click reset a THUMBNAIL's camera.
      expect(state.cam.zoom).toBe(4)
    })
  })

  it('detach removes every listener', () => {
    detach()
    const e = wheel(-240)
    cv.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    expect(state.cam.zoom).toBe(1)
  })
})

// ── #294 wheel policy + #295 pinch ───────────────────────────────────────────
describe('particle-life-gpu camera — wheel policy and pinch (#294, #295)', () => {
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
