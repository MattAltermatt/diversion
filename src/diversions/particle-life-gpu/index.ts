// index.ts — framework wiring for the WebGPU variant of Particle Life. Auto-registers
// via the registry glob. Follows the neural-ca ready-flag pattern: setup() returns
// synchronously with ready=false and acquires the shared GPUDevice in a fire-and-forget
// tail; frame() no-ops until the pipelines are built. The device is the page-level
// shared singleton (framework/webgpu.ts), never one-per-diversion.
//
// This is the gallery's first INTERACTIVE piece: the diversion attaches wheel (zoom)
// and drag (pan) listeners to its OWN canvas (ctx.canvas) and tears them down in
// teardown — no framework contract change, and the hands-off screensaver behaviour is
// untouched. Interaction is gated on the host's `data-interactive` (#290), so gallery
// tiles never hijack page scroll — NOT on canvas width, which called a one-column
// tile interactive and did exactly that.
import { defineDiversion, type Size } from '../../framework/types'
import { getSharedDevice } from '../../framework/webgpu'
import {
  createPinchTracker,
  drivenByViewer,
  gesturesYielded,
  wheelOwned,
} from '../../framework/canvasGestures'
import { particleLifeGpuSchema, type ParticleLifeGpuConfig } from './schema'
import { particleLifeGpuPresets } from './presets'
import { reconcileMatrix } from './reconcile'
import { worldDims, DT, type Camera } from './pack'
import {
  initGPU, runFrame, resizeGPU, writeParams, writeColors, writeMatrix, writeView, writeFade,
  writeBloom, disposeGPU, type GpuResources,
} from './gpu'
import { meta } from './meta'

interface State {
  ctx: GPUCanvasContext
  cfg: ParticleLifeGpuConfig
  size: Size
  dpr: number
  res: GpuResources | null
  ready: boolean
  disposed: boolean
  acc: number // fractional sim-step accumulator → speed < 1 = slow motion
  simTime: number // accumulated sim time (s) driving the breathe pulse (#213)
  cam: Camera // zoom + pan (mouse-driven)
  camDirty: boolean // camera changed → re-upload the view uniform next frame
  detach: (() => void) | null // remove the input listeners on teardown
}

const dprOf = (): number => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)

/** Attach wheel-zoom (toward the cursor) + drag-pan + double-click-reset to the
 *  diversion's own canvas. Returns a detach function. Mutates state.cam / camDirty.
 *
 *  Exported only so `camera.test.ts` can drive it: this code had NO coverage, which
 *  is how the gallery wheel-hijack and the movementX touch hazard both shipped (#290). */
export function attachCamera(cv: HTMLCanvasElement, state: State): () => void {
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

  /** Scale the view by `factor` about a point in DEVICE pixels, keeping the world
   *  under that point pinned to it. The wheel drives it with the cursor; a pinch
   *  drives it with the midpoint between two fingers (#295). */
  const zoomAbout = (px: number, py: number, factor: number) => {
    const cx = cv.width / 2, cy = cv.height / 2
    const { w, h } = dims()
    const sBefore = scaleOf()
    // world point currently under that point
    const wx = w / 2 + state.cam.panX + (px - cx) / sBefore
    const wy = h / 2 + state.cam.panY + (py - cy) / sBefore
    // min zoom = 1 (cover-fit): never zoom out past the world filling the viewport.
    state.cam.zoom = Math.min(16, Math.max(1, state.cam.zoom * factor))
    const sAfter = coverScale() * state.cam.zoom
    // keep that world point pinned, then clamp inside the arena
    state.cam.panX = wx - (px - cx) / sAfter - w / 2
    state.cam.panY = wy - (py - cy) / sAfter - h / 2
    clampPan()
    state.camDirty = true
  }

  /** Translate the view by a CLIENT-pixel delta. Used by BOTH the one-finger drag
   *  and a two-finger pinch's midpoint travel, so the two cannot drift apart on the
   *  y sign — which differs between these three cameras and mirrors their WGSL. */
  const panByClient = (dx: number, dy: number) => {
    const r = cv.getBoundingClientRect()
    const sc = scaleOf()
    state.cam.panX -= (dx * (cv.width / r.width)) / sc
    state.cam.panY -= (dy * (cv.height / r.height)) / sc
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
  // this world's — toroidal, cover-fit, y-down — and stays here.
  const pinch = createPinchTracker()
  const canPinch = () => interactive() && gesturesYielded(cv)
  /** Zoom at the moment the current pinch anchored. A step's `scale` is ABSOLUTE
   *  against that anchor, so the target below is clamped exactly once and idempotently
   *  — folding incremental ratios into an already-clamped zoom lets a two-finger PAN
   *  ratchet the view in at minimum zoom. See PinchStep.scale. */
  let pinchZoom0 = 1

  // The pointer that owns the drag, not a boolean: onUp used to accept ANY pointerId,
  // so on a full-bleed Play canvas a second finger lifting ended the primary finger's
  // drag, which then stayed dead until it lifted and re-pressed.
  let activeId: number | null = null
  // Previous CLIENT position of the dragging pointer. NOT `e.movementX/Y`: that is
  // absent or zero for touch pointers on some engines, and `panX -= undefined * n`
  // is NaN — which `clampPan`'s Math.min/max propagates rather than corrects, so a
  // single touch drag would destroy the view until reload. Deltas we compute
  // ourselves are defined for every pointer type.
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
      if (step.anchor) pinchZoom0 = state.cam.zoom
      const mid = cursorDev({ clientX: step.cx, clientY: step.cy })
      zoomAbout(mid.x, mid.y, (pinchZoom0 * step.scale) / state.cam.zoom)
      // Zoom FIRST, then translate: the pan is applied at the scale the viewer now
      // sees. Two fingers moving together without changing their span is a pan, and
      // without this it would do nothing — zoomAbout(mid, 1) is the identity.
      panByClient(step.dx, step.dy)
      return
    }
    // No guard on `pinch.active()` here: the drag is already disarmed at pointerdown
    // the moment a second finger lands, and there is no path that re-arms it while a
    // multi-finger gesture is in flight. A defensive check here measured as dead code
    // — deleting it fails no test, which is exactly why it should not sit here
    // looking load-bearing.
    if (e.pointerId !== activeId) return
    panByClient(e.clientX - last.x, e.clientY - last.y)
    last = { x: e.clientX, y: e.clientY }
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

const particleLifeGpu = defineDiversion<typeof particleLifeGpuSchema, State, 'webgpu'>({
  ...meta,
  // Attaches its own canvas listeners (attachCamera) rather than using onPointer,
  // so the host must still hand it touch-action: none. See types.ts (#290).
  ownsCanvasGestures: true,
  schema: particleLifeGpuSchema,
  presets: particleLifeGpuPresets,
  reconcile: reconcileMatrix,

  setup(ctx, cfg, size): State {
    const state: State = {
      ctx, cfg, size, dpr: dprOf(), res: null, ready: false, disposed: false, acc: 0, simTime: 0,
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
    const cfg = state.cfg
    state.acc += cfg.speed
    let steps = Math.floor(state.acc)
    state.acc -= steps
    if (steps > 8) steps = 8
    // Breathe (#213): a slow force pulse in SIM time (simTime advances by the
    // fractional speed, so Speed scales the rhythm coherently). Off = no per-frame
    // writes and forceMul stays exactly as the last config change left it.
    if (cfg.breathe) {
      state.simTime += cfg.speed * DT
      const mul = 1 + cfg.breatheDepth * Math.sin((2 * Math.PI * state.simTime) / cfg.breathePeriod)
      writeParams(state.res, cfg, mul)
    }
    runFrame(state.res, cfg, steps)
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
    // Re-upload the matrix on any change that alters it: a symmetry flip, a bias
    // shift, OR a direct cell edit / Zero / Reset (cfg.matrix is a fresh reference
    // each edit, undefined⇄array on Reset) — else hand-tuning never reaches the GPU.
    if (cfg.symmetry !== prev.symmetry || cfg.attractBias !== prev.attractBias || cfg.matrix !== prev.matrix || cfg.matrixSeed !== prev.matrixSeed) writeMatrix(state.res, cfg)
    if (cfg.palette !== prev.palette) writeColors(state.res, cfg)
    if (cfg.background !== prev.background || cfg.trailFade !== prev.trailFade) writeFade(state.res, cfg)
    if (cfg.bloom !== prev.bloom || cfg.bloomIntensity !== prev.bloomIntensity || cfg.bloomThreshold !== prev.bloomThreshold) writeBloom(state.res, cfg)
    if (cfg.dotSize !== prev.dotSize || cfg.colorBy !== prev.colorBy || cfg.heatScale !== prev.heatScale) writeView(state.res, cfg, size, state.cam)
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
