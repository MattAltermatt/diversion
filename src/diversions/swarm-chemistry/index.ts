// index.ts — framework wiring for Swarm Chemistry (WebGPU). Auto-registers via the
// registry glob. Follows the swarmalators / particle-life-gpu ready-flag pattern:
// setup() returns synchronously with ready=false and acquires the shared GPUDevice in a
// fire-and-forget tail; frame() no-ops until the pipelines are built. The device is the
// page-level shared singleton (framework/webgpu.ts), never one-per-diversion.
//
// Interactive: wheel = zoom toward the cursor, drag = pan, double-click = reset. Gated
// on the host's `data-interactive` (#290) so gallery tiles don't hijack page scroll —
// NOT on canvas width, which called a one-column tile interactive and did exactly that.
import { defineDiversion, type Size } from '../../framework/types'
import { getSharedDevice } from '../../framework/webgpu'
import { drivenByViewer, gesturesYielded } from '../../framework/canvasGestures'
import { swarmChemistrySchema, type SwarmChemistryConfig } from './schema'
import { swarmChemistryPresets } from './presets'
import { type Camera } from './pack'
import {
  initGPU, runFrame, resizeGPU, writeParams, writeView, writeFade, disposeGPU, type GpuResources,
} from './gpu'
import { meta } from './meta'

interface State {
  ctx: GPUCanvasContext
  cfg: SwarmChemistryConfig
  size: Size
  dpr: number
  res: GpuResources | null
  ready: boolean
  disposed: boolean
  acc: number // fractional sim-step accumulator → speed < 1 = slow motion
  cam: Camera
  camDirty: boolean
  detach: (() => void) | null
}

const dprOf = (): number => Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Wheel-zoom (toward the cursor) + drag-pan + double-click-reset. Pan is in sim units
 *  (the arena is centred by packView), bounded to the arena half-extent so the swarm
 *  stays reachable.
 *
 *  Exported only so `camera.test.ts` can drive it: this code had NO coverage, which
 *  is how the gallery wheel-hijack and the movementX touch hazard both shipped (#290). */
export function attachCamera(cv: HTMLCanvasElement, state: State): () => void {
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
  const fitScale = () => {
    const arena = state.res ? Math.min(state.res.arenaW, state.res.arenaH) : state.cfg.worldMin
    return Math.min(cv.width, cv.height) / arena
  }
  const scaleOf = () => fitScale() * state.cam.zoom
  const clampPan = () => {
    const halfW = state.res ? state.res.arenaW / 2 : state.cfg.worldMin / 2
    const halfH = state.res ? state.res.arenaH / 2 : state.cfg.worldMin / 2
    state.cam.panX = clamp(state.cam.panX, -halfW, halfW)
    state.cam.panY = clamp(state.cam.panY, -halfH, halfH)
  }

  const onWheel = (e: WheelEvent) => {
    if (!interactive()) return
    e.preventDefault()
    const cx = cv.width / 2, cy = cv.height / 2
    const cur = cursorDev(e)
    const sBefore = scaleOf()
    const wx = state.cam.panX + (cur.x - cx) / sBefore
    const wy = state.cam.panY + (cur.y - cy) / sBefore
    state.cam.zoom = clamp(state.cam.zoom * Math.exp(-e.deltaY * 0.0015), 1, 16)
    const sAfter = fitScale() * state.cam.zoom
    state.cam.panX = wx - (cur.x - cx) / sAfter
    state.cam.panY = wy - (cur.y - cy) / sAfter
    clampPan()
    state.camDirty = true
  }

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
    if (!canDrag(e)) return
    activeId = e.pointerId
    last = { x: e.clientX, y: e.clientY }
    cv.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== activeId) return
    const r = cv.getBoundingClientRect()
    const sc = scaleOf()
    state.cam.panX -= ((e.clientX - last.x) * (cv.width / r.width)) / sc
    state.cam.panY -= ((e.clientY - last.y) * (cv.height / r.height)) / sc
    last = { x: e.clientX, y: e.clientY }
    clampPan()
    state.camDirty = true
  }
  const onUp = (e: PointerEvent) => {
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

const swarmChemistry = defineDiversion<typeof swarmChemistrySchema, State, 'webgpu'>({
  ...meta,
  // Attaches its own canvas listeners (attachCamera) rather than using onPointer,
  // so the host must still hand it touch-action: none. See types.ts (#290).
  ownsCanvasGestures: true,
  schema: swarmChemistrySchema,
  presets: swarmChemistryPresets,

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
        state.camDirty = true
      })
      .catch((err) => {
        if (!state.disposed) console.warn('swarm-chemistry: GPU init failed —', err)
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
    // state.acc is now the fractional progress toward the next step → the render lerps
    // prevPos → pos by this alpha, so playback stays smooth even at 0.05× (one step per
    // ~20 frames glides instead of freeze-then-jump).
    runFrame(state.res, state.cfg, steps, state.acc)
  },

  update(state, cfg, size): boolean {
    const prev = state.cfg
    // structural → false (re-setup reseeds positions/genomes + reallocs buffers)
    if (cfg.count !== prev.count || cfg.seed !== prev.seed || cfg.recipe !== prev.recipe || cfg.worldMin !== prev.worldMin) return false
    state.cfg = cfg
    state.size = size
    if (!state.res) return true // still initializing; the async tail reads state.cfg
    // evolution params (live-editable — the whole point of watching it evolve)
    if (cfg.evolve !== prev.evolve || cfg.competition !== prev.competition || cfg.mutationRate !== prev.mutationRate
      || cfg.collisionRadius !== prev.collisionRadius || cfg.simThreshold !== prev.simThreshold) writeParams(state.res, cfg)
    if (cfg.dotSize !== prev.dotSize || cfg.colorBoost !== prev.colorBoost) writeView(state.res, cfg, size, state.cam)
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

export default swarmChemistry
