// index.ts — framework wiring for Swarmalators (WebGPU). Auto-registers via the registry
// glob. Follows the neural-ca / particle-life-gpu ready-flag pattern: setup() returns
// synchronously with ready=false and acquires the shared GPUDevice in a fire-and-forget
// tail; frame() no-ops until the pipelines are built. The device is the page-level shared
// singleton (framework/webgpu.ts), never one-per-diversion.
//
// Interactive (like particle-life-gpu): wheel = zoom toward the cursor, drag = pan,
// double-click = reset. The world is FREE SPACE and origin-centred, so the camera is
// simpler than Particle Life's — no toroidal arena to clamp against; pan is just bounded so
// the swarm can't be lost. Interaction is gated to a large view so gallery tiles don't
// hijack page scroll.
import { defineDiversion, type Size } from '../../framework/types'
import { getSharedDevice } from '../../framework/webgpu'
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

const MIN_INTERACTIVE_CSS_W = 480
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Wheel-zoom (toward the cursor) + drag-pan + double-click-reset on the diversion's own
 *  canvas. Free-space: the fit scale maps VIEW_RADIUS into 90% of the min half-dimension;
 *  pan is bounded to ±(VIEW_RADIUS+0.5) world units so the swarm stays reachable. */
function attachCamera(cv: HTMLCanvasElement, state: State): () => void {
  const fit = () => (Math.min(cv.width, cv.height) / 2) * 0.9 / VIEW_RADIUS
  const scaleOf = () => fit() * state.cam.zoom
  const cursorDev = (e: { clientX: number; clientY: number }) => {
    const r = cv.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }
  }
  const interactive = () => cv.clientWidth >= MIN_INTERACTIVE_CSS_W
  const panLimit = VIEW_RADIUS + 0.5
  const clampPan = () => {
    state.cam.panX = clamp(state.cam.panX, -panLimit, panLimit)
    state.cam.panY = clamp(state.cam.panY, -panLimit, panLimit)
  }

  const onWheel = (e: WheelEvent) => {
    if (!interactive()) return
    e.preventDefault()
    const cx = cv.width / 2, cy = cv.height / 2
    const cur = cursorDev(e)
    const sBefore = scaleOf()
    // world point under the cursor (y is flipped on screen)
    const wx = state.cam.panX + (cur.x - cx) / sBefore
    const wy = state.cam.panY - (cur.y - cy) / sBefore
    state.cam.zoom = clamp(state.cam.zoom * Math.exp(-e.deltaY * 0.0015), 1, 16)
    const sAfter = fit() * state.cam.zoom
    state.cam.panX = wx - (cur.x - cx) / sAfter
    state.cam.panY = wy + (cur.y - cy) / sAfter
    clampPan()
    state.camDirty = true
  }

  let dragging = false
  const onDown = (e: PointerEvent) => {
    if (!interactive()) return
    dragging = true
    cv.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const r = cv.getBoundingClientRect()
    const sc = scaleOf()
    state.cam.panX -= (e.movementX * (cv.width / r.width)) / sc
    state.cam.panY += (e.movementY * (cv.height / r.height)) / sc
    clampPan()
    state.camDirty = true
  }
  const onUp = (e: PointerEvent) => {
    dragging = false
    cv.releasePointerCapture?.(e.pointerId)
  }
  const onDbl = () => {
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
