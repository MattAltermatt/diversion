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
      // jsdom computes touchAction as '' (never 'none'), which is the retained case.
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
