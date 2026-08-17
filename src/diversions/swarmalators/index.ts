// index.ts — framework wiring for Swarmalators (WebGPU). Auto-registers via the registry
// glob. Follows the neural-ca / particle-life-gpu ready-flag pattern: setup() returns
// synchronously with ready=false and acquires the shared GPUDevice in a fire-and-forget
// tail; frame() no-ops until the pipelines are built. The device is the page-level shared
// singleton (framework/webgpu.ts), never one-per-diversion.
//
// Interactive (like particle-life-gpu): wheel = zoom toward the cursor, drag = pan,
// double-click = reset. The world is FREE SPACE and origin-centred, so the camera is
// simpler than Particle Life's — no toroidal arena to clamp against; pan is just bounded so
// the swarm can't be lost. Interaction is gated on the host's `data-interactive` (#290)
// so gallery tiles don't hijack page scroll — NOT on canvas width, which called a
// one-column tile interactive and did exactly that.
import { defineDiversion, type Size } from '../../framework/types'
import { getSharedDevice } from '../../framework/webgpu'
import {
  createPinchTracker,
  drivenByViewer,
  gesturesYielded,
  wheelOwned,
} from '../../framework/canvasGestures'
import { swarmalatorsSchema, type SwarmalatorsConfig } from './schema'
import { swarmalatorsPresets } from './presets'
import { VIEW_RADIUS, type Camera } from './pack'
import {
  initGPU, runFrame, resizeGPU, writeParams, writeView, writeFade, disposeGPU, type GpuResources,
} from './gpu'
import { meta } from './meta'

interface State {
  ctx: GPUCanvasContext
  cfg: SwarmalatorsConfig
  size: Size
  dpr: number
  res: GpuResources | null
  ready: boolean
  disposed: boolean
  acc: number // fractional sim-step accumulator → speed < 1 = slow motion
  cam: Camera // zoom + pan (mouse-driven)
  camDirty: boolean
  detach: (() => void) | null
}

const dprOf = (): number => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Wheel-zoom (toward the cursor) + drag-pan + double-click-reset on the diversion's own
 *  canvas. Free-space: the fit scale maps VIEW_RADIUS into 90% of the min half-dimension;
 *  pan is bounded to ±(VIEW_RADIUS+0.5) world units so the swarm stays reachable.
 *
 *  Exported only so `camera.test.ts` can drive it: this code had NO coverage, which
 *  is how the gallery wheel-hijack and the movementX touch hazard both shipped (#290). */
export function attachCamera(cv: HTMLCanvasElement, state: State): () => void {
  const fit = () => (Math.min(cv.width, cv.height) / 2) * 0.9 / VIEW_RADIUS
  const scaleOf = () => fit() * state.cam.zoom
  const cursorDev = (e: { clientX: number; clientY: number }) => {
    const r = cv.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }
  }
const interactive = () => drivenByViewer(cv)
  /** May this pointerdown start a camera drag?
   *   - `interactive()` — not a gallery thumbnail.
   *   - `isPrimary` — a second finger must not start a rival drag against the first.
   *   - `button === 0` — pointerdown fires for the right and middle buttons too, and
   *     `isPrimary` is true for a mouse whichever one is down, so a reflexive
   *     right-click-drag panned the view and then popped the context menu over it.
   *   - touch only where the framework has actually taken the browser's gesture:
   *     below 820px the Config preview deliberately hands it back, and panning there
   *     would fight the page scroll the viewer was asking for. */
  const canDrag = (e: PointerEvent) =>
    interactive() &&
    e.isPrimary &&
    e.button === 0 &&
    (e.pointerType !== 'touch' || gesturesYielded(cv))
  const panLimit = VIEW_RADIUS + 0.5
  const clampPan = () => {
    state.cam.panX = clamp(state.cam.panX, -panLimit, panLimit)
    state.cam.panY = clamp(state.cam.panY, -panLimit, panLimit)
  }

  /** Scale the view by `factor` about a point in DEVICE pixels, keeping the world
   *  under that point pinned to it. The wheel drives it with the cursor; a pinch
   *  drives it with the midpoint between two fingers (#295).
   *
   *  The y terms are INVERTED against the other two cameras, and deliberately: this
   *  world is y-up (see gpu.ts's vertex stage). camera.test.ts pins the sign. */
  const zoomAbout = (px: number, py: number, factor: number) => {
    const cx = cv.width / 2, cy = cv.height / 2
    const sBefore = scaleOf()
    // world point under that point (y is flipped on screen)
    const wx = state.cam.panX + (px - cx) / sBefore
    const wy = state.cam.panY - (py - cy) / sBefore
    state.cam.zoom = clamp(state.cam.zoom * factor, 1, 16)
    const sAfter = fit() * state.cam.zoom
    state.cam.panX = wx - (px - cx) / sAfter
    state.cam.panY = wy + (py - cy) / sAfter
    clampPan()
    state.camDirty = true
  }

  const onWheel = (e: WheelEvent) => {
    // NOT `interactive()` alone (#294): on the Config preview below 820px this canvas
    // is sticky over a form the viewer came to scroll, and consuming the wheel there
    // ate the scroll. `wheelOwned` declines when something behind the canvas can
    // scroll — unless the viewer asked for zoom with ctrl, which is also how a
    // trackpad pinch arrives.
    if (!wheelOwned(cv, e)) return
    e.preventDefault()
    const cur = cursorDev(e)
    zoomAbout(cur.x, cur.y, Math.exp(-e.deltaY * 0.0015))
  }

  // Two-finger pinch (#295). Only the decoding is shared; the transform it feeds is
  // this world's — free-space, y-up — and stays here.
  const pinch = createPinchTracker()
  const canPinch = () => interactive() && gesturesYielded(cv)

  // The pointer that owns the drag, not a boolean: onUp used to accept ANY pointerId,
  // so on a full-bleed Play canvas a second finger lifting ended the primary finger's
  // drag, which then stayed dead until it lifted and re-pressed.
  let activeId: number | null = null
  // Previous CLIENT position of the dragging pointer. NOT `e.movementX/Y`: that is
  // absent or zero for touch pointers on some engines, and `panX -= undefined * n`
  // is NaN — which `clamp`'s Math.min/max propagates rather than corrects, so one
  // touch drag would destroy the view until reload.
  let last = { x: 0, y: 0 }
  const onDown = (e: PointerEvent) => {
    if (canPinch()) pinch.down(e)
    if (pinch.active()) {
      // A second finger turns an in-flight pan into a pinch. Drop the drag rather
      // than running both: `last` would keep chasing one finger while the view
      // scales under it, and the world would slide away as you zoomed.
      activeId = null
      return
    }
    if (!canDrag(e)) return
    activeId = e.pointerId
    last = { x: e.clientX, y: e.clientY }
    cv.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    const step = canPinch() ? pinch.move(e) : null
    if (step) {
      const mid = cursorDev({ clientX: step.cx, clientY: step.cy })
      zoomAbout(mid.x, mid.y, step.scale)
      return
    }
    // No guard on `pinch.active()` here: the drag is already disarmed at pointerdown
    // the moment a second finger lands, and there is no path that re-arms it while a
    // multi-finger gesture is in flight. A defensive check here measured as dead code
    // — deleting it fails no test, which is exactly why it should not sit here
    // looking load-bearing.
    if (e.pointerId !== activeId) return
    const r = cv.getBoundingClientRect()
    const sc = scaleOf()
    state.cam.panX -= ((e.clientX - last.x) * (cv.width / r.width)) / sc
    state.cam.panY += ((e.clientY - last.y) * (cv.height / r.height)) / sc
    last = { x: e.clientX, y: e.clientY }
    clampPan()
    state.camDirty = true
  }
  const onUp = (e: PointerEvent) => {
    const remaining = pinch.up(e)
    if (remaining) {
      // Pinch -> pan handover. Adopt the finger still down and re-seed `last` from
      // its CURRENT position: keeping the stale one would apply every pixel it
      // travelled during the pinch as a single pan step.
      activeId = remaining.pointerId
      last = { x: remaining.x, y: remaining.y }
      return
    }
    if (e.pointerId !== activeId) return
    activeId = null
    // Guarded: releasePointerCapture throws NotFoundError for a pointer that is no
    // longer active, which is reachable via pointercancel.
    if (cv.hasPointerCapture?.(e.pointerId)) cv.releasePointerCapture?.(e.pointerId)
  }
  const onDbl = () => {
    // Was ungated, so a double-click reset the camera on a gallery thumbnail too.
    if (!interactive()) return
    state.cam = { zoom: 1, panX: 0, panY: 0 }
    state.camDirty = true
  }

  cv.addEventListener('wheel', onWheel, { passive: false })
  cv.addEventListener('pointerdown', onDown)
  cv.addEventListener('pointermove', onMove)
  cv.addEventListener('pointerup', onUp)
  cv.addEventListener('pointercancel', onUp)
  cv.addEventListener('dblclick', onDbl)
  return () => {
    cv.removeEventListener('wheel', onWheel)
    cv.removeEventListener('pointerdown', onDown)
    cv.removeEventListener('pointermove', onMove)
    cv.removeEventListener('pointerup', onUp)
    cv.removeEventListener('pointercancel', onUp)
    cv.removeEventListener('dblclick', onDbl)
  }
}

const swarmalators = defineDiversion<typeof swarmalatorsSchema, State, 'webgpu'>({
  ...meta,
  // Attaches its own canvas listeners (attachCamera) rather than using onPointer,
  // so the host must still hand it touch-action: none. See types.ts (#290).
  ownsCanvasGestures: true,
  schema: swarmalatorsSchema,
  presets: swarmalatorsPresets,

  setup(ctx, cfg, size): State {
    const state: State = {
      ctx, cfg, size, dpr: dprOf(), res: null, ready: false, disposed: false, acc: 0,
      cam: { zoom: 1, panX: 0, panY: 0 }, camDirty: false, detach: null,
    }
    const cv = ctx.canvas as HTMLCanvasElement | undefined
    if (cv && typeof cv.addEventListener === 'function') state.detach = attachCamera(cv, state)
    void getSharedDevice()
      .then((device) => {
        if (state.disposed) return
        const format = navigator.gpu.getPreferredCanvasFormat()
        state.res = initGPU(device, ctx, format, state.cfg, state.size, state.dpr)
        state.ready = true
        state.camDirty = true // flush any pan/zoom done during init
      })
      .catch((err) => {
        if (!state.disposed) console.warn('swarmalators: GPU init failed —', err)
      })
    return state
  },

  frame(state, _ctx, _t, _dt) {
    if (!state.ready || !state.res) return
    if (state.camDirty) {
      writeView(state.res, state.cfg, state.size, state.cam)
      state.camDirty = false
    }
    state.acc += state.cfg.speed
    let steps = Math.floor(state.acc)
    state.acc -= steps
    if (steps > 8) steps = 8
    runFrame(state.res, state.cfg, steps)
  },

  update(state, cfg, size): boolean {
    const prev = state.cfg
    // structural → false (re-setup reseeds positions/phases/omega + reallocs buffers)
    if (cfg.count !== prev.count || cfg.seed !== prev.seed) return false
    state.cfg = cfg
    state.size = size
    if (!state.res) return true // still initializing; the async tail reads state.cfg
    if (cfg.J !== prev.J || cfg.K !== prev.K || cfg.omegaSpread !== prev.omegaSpread) writeParams(state.res, cfg)
    if (cfg.colorMap !== prev.colorMap || cfg.dotSize !== prev.dotSize) writeView(state.res, cfg, size, state.cam)
    if (cfg.background !== prev.background || cfg.trailFade !== prev.trailFade) writeFade(state.res, cfg)
    return true
  },

  resize(state, size) {
    state.size = size
    if (state.res) resizeGPU(state.res, state.cfg, size, state.cam)
  },

  teardown(state) {
    state.disposed = true
    state.detach?.()
    state.detach = null
    if (state.res) {
      disposeGPU(state.res)
      state.res = null
    }
  },
})

export default swarmalators
