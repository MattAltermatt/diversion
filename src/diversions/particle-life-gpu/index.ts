// index.ts — framework wiring for the WebGPU variant of Particle Life. Auto-registers
// via the registry glob. Follows the neural-ca ready-flag pattern: setup() returns
// synchronously with ready=false and acquires the shared GPUDevice in a fire-and-forget
// tail; frame() no-ops until the pipelines are built. The device is the page-level
// shared singleton (framework/webgpu.ts), never one-per-diversion.
//
// This is the gallery's first INTERACTIVE piece: the diversion attaches wheel (zoom)
// and drag (pan) listeners to its OWN canvas (ctx.canvas) and tears them down in
// teardown — no framework contract change, and the hands-off screensaver behaviour is
// untouched. Interaction is gated to a large view (play / fullscreen), so gallery
// tiles never hijack page scroll.
import { defineDiversion, type Size } from '../../framework/types'
import { getSharedDevice } from '../../framework/webgpu'
import { particleLifeGpuSchema, type ParticleLifeGpuConfig } from './schema'
import { particleLifeGpuPresets } from './presets'
import { worldDims, type Camera } from './pack'
import {
  initGPU, runFrame, resizeGPU, writeParams, writeColors, writeMatrix, writeView, writeFade,
  disposeGPU, type GpuResources,
} from './gpu'

interface State {
  ctx: GPUCanvasContext
  cfg: ParticleLifeGpuConfig
  size: Size
  dpr: number
  res: GpuResources | null
  ready: boolean
  disposed: boolean
  acc: number // fractional sim-step accumulator → speed < 1 = slow motion
  cam: Camera // zoom + pan (mouse-driven)
  camDirty: boolean // camera changed → re-upload the view uniform next frame
  detach: (() => void) | null // remove the input listeners on teardown
}

const dprOf = (): number => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)

// Only drive zoom/pan when the canvas is large (play / config-preview / fullscreen),
// so wheeling over a small gallery tile doesn't hijack page scroll.
const MIN_INTERACTIVE_CSS_W = 480

/** Attach wheel-zoom (toward the cursor) + drag-pan + double-click-reset to the
 *  diversion's own canvas. Returns a detach function. Mutates state.cam / camDirty. */
function attachCamera(cv: HTMLCanvasElement, state: State): () => void {
  const dims = () => worldDims(state.cfg.worldSize)
  const coverScale = () => {
    const { w, h } = dims()
    return Math.max(cv.width / w, cv.height / h)
  }
  const scaleOf = () => coverScale() * state.cam.zoom
  const cursorDev = (e: { clientX: number; clientY: number }) => {
    const r = cv.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }
  }
  const interactive = () => cv.clientWidth >= MIN_INTERACTIVE_CSS_W
  // Keep the view INSIDE the arena — never reveal buffer outside the world. The view
  // half-extent in world units is (canvas/2)/scale; the centre can travel to within
  // that of each edge (or is pinned centred when the world is smaller than the view).
  const clampPan = () => {
    const { w, h } = dims()
    const sc = scaleOf()
    const maxPanX = Math.max(0, w / 2 - cv.width / 2 / sc)
    const maxPanY = Math.max(0, h / 2 - cv.height / 2 / sc)
    state.cam.panX = Math.min(maxPanX, Math.max(-maxPanX, state.cam.panX))
    state.cam.panY = Math.min(maxPanY, Math.max(-maxPanY, state.cam.panY))
  }

  const onWheel = (e: WheelEvent) => {
    if (!interactive()) return
    e.preventDefault()
    const cx = cv.width / 2, cy = cv.height / 2
    const { w, h } = dims()
    const cur = cursorDev(e)
    const sBefore = scaleOf()
    // world point currently under the cursor
    const wx = w / 2 + state.cam.panX + (cur.x - cx) / sBefore
    const wy = h / 2 + state.cam.panY + (cur.y - cy) / sBefore
    // min zoom = 1 (cover-fit): never zoom out past the world filling the viewport.
    state.cam.zoom = Math.min(16, Math.max(1, state.cam.zoom * Math.exp(-e.deltaY * 0.0015)))
    const sAfter = coverScale() * state.cam.zoom
    // keep that world point pinned under the cursor, then clamp inside the arena
    state.cam.panX = wx - (cur.x - cx) / sAfter - w / 2
    state.cam.panY = wy - (cur.y - cy) / sAfter - h / 2
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
    state.cam.panY -= (e.movementY * (cv.height / r.height)) / sc
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

const particleLifeGpu = defineDiversion<typeof particleLifeGpuSchema, State, 'webgpu'>({
  id: 'particle-life-gpu',
  title: 'Particle Life (GPU)',
  description:
    'The same hidden matrix of attractions that grows cell-like creatures from random soup — now run entirely on the GPU as a compute shader, so tens of thousands of particles swarm at once. Scroll to zoom, drag to pan. A different world every seed.',
  kind: 'webgpu',
  schema: particleLifeGpuSchema,
  presets: particleLifeGpuPresets,

  setup(ctx, cfg, size): State {
    const state: State = {
      ctx, cfg, size, dpr: dprOf(), res: null, ready: false, disposed: false, acc: 0,
      cam: { zoom: 1, panX: 0, panY: 0 }, camDirty: false, detach: null,
    }
    // Input listeners bind to the canvas synchronously (available before the device
    // resolves); zoom/pan during the init gap is captured in state.cam and applied on
    // the first ready frame. Guard the canvas: it can be an OffscreenCanvas (no DOM
    // events) or a test mock, in which case the piece is simply non-interactive.
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
        if (!state.disposed) console.warn('particle-life-gpu: GPU init failed —', err)
      })
    return state
  },

  frame(state, _ctx, _t, _dt) {
    if (!state.ready || !state.res) return // no-op until the device + pipelines resolve
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
    // structural → false (re-setup reseeds positions/species + resizes the arena)
    if (
      cfg.count !== prev.count || cfg.colors !== prev.colors || cfg.seed !== prev.seed ||
      cfg.worldSize !== prev.worldSize
    ) return false
    state.cfg = cfg
    state.size = size
    if (!state.res) return true // still initializing; the async tail reads state.cfg
    writeParams(state.res, cfg)
    if (cfg.symmetry !== prev.symmetry || cfg.attractBias !== prev.attractBias) writeMatrix(state.res, cfg)
    if (cfg.palette !== prev.palette) writeColors(state.res, cfg)
    if (cfg.background !== prev.background || cfg.trailFade !== prev.trailFade) writeFade(state.res, cfg)
    if (cfg.dotSize !== prev.dotSize) writeView(state.res, cfg, size, state.cam)
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
      disposeGPU(state.res) // frees buffers/textures — NEVER device.destroy() (shared singleton)
      state.res = null
    }
  },
})

export default particleLifeGpu
