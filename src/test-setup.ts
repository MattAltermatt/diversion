import '@testing-library/jest-dom'
import { beforeEach } from 'vitest'

// jsdom ships no canvas 2D/WebGL context, no matchMedia, and no Resize/Intersection
// observers — so any test that mounts <AnimationHost> used to either bail early
// (ctx === null → the draw path never ran) or spam "Not implemented: getContext".
// This setup file (wired via vite.config.ts `test.setupFiles`) installs lightweight,
// call-recording mocks for ALL of them, so EVERY host-mounting test gets a working
// context and the real setup()/frame() path is exercised. Tests that must *drive*
// these (deterministic rAF, observer callbacks, reduced-motion toggle) read/write
// the exported `harness` and `flushRaf` rather than re-stubbing per file (#128).

// ---------------------------------------------------------------------------
// Mock 2D / WebGL contexts
// ---------------------------------------------------------------------------

/** A recording mock context: `calls` lists every method invoked, in order. */
export interface MockCtxRecord {
  calls: string[]
}

export type Mock2DContext = CanvasRenderingContext2D & MockCtxRecord
export type MockGLContext = WebGL2RenderingContext & MockCtxRecord

/** Build a call-recording stand-in for CanvasRenderingContext2D. Covers every
 *  2D method the gallery's diversions touch (fill/stroke/path/gradient/blit). */
export function make2DContext(): Mock2DContext {
  const calls: string[] = []
  const rec =
    (name: string) =>
    (..._args: unknown[]) => {
      calls.push(name)
    }
  const gradient = { addColorStop() {} }
  const imageData = (w: number, h: number) => ({
    data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
    width: w,
    height: h,
  })
  const ctx = {
    calls,
    canvas: { width: 300, height: 150 },
    // path + draw
    setTransform: rec('setTransform'),
    resetTransform: rec('resetTransform'),
    save: rec('save'),
    restore: rec('restore'),
    translate: rec('translate'),
    scale: rec('scale'),
    rotate: rec('rotate'),
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    arc: rec('arc'),
    rect: rec('rect'),
    ellipse: rec('ellipse'),
    quadraticCurveTo: rec('quadraticCurveTo'),
    bezierCurveTo: rec('bezierCurveTo'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    clearRect: rec('clearRect'),
    clip: rec('clip'),
    drawImage: rec('drawImage'),
    putImageData: rec('putImageData'),
    createRadialGradient: (..._a: unknown[]) => {
      calls.push('createRadialGradient')
      return gradient
    },
    createLinearGradient: (..._a: unknown[]) => {
      calls.push('createLinearGradient')
      return gradient
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      calls.push('getImageData')
      return imageData(w, h)
    },
    createImageData: (w: number, h: number) => {
      calls.push('createImageData')
      return imageData(w, h)
    },
    // mutable style state — assignment is a no-op the diversions just read back
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
  }
  return ctx as unknown as Mock2DContext
}

/** Build a call-recording stand-in for WebGL2RenderingContext. Returns truthy
 *  handles + passing COMPILE/LINK status so a real shader-building setup()
 *  (plasma/metaballs) runs to completion without a GPU. */
export function makeGLContext(): MockGLContext {
  const calls: string[] = []
  const rec =
    (name: string) =>
    (..._args: unknown[]) => {
      calls.push(name)
    }
  const handle = (tag: string) => ({ __mock: tag })
  const gl = {
    calls,
    drawingBufferWidth: 300,
    drawingBufferHeight: 150,
    // enum constants — any distinct numbers work
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    TRIANGLES: 0x0004,
    // shader / program lifecycle
    createShader: (..._a: unknown[]) => {
      calls.push('createShader')
      return handle('shader')
    },
    shaderSource: rec('shaderSource'),
    compileShader: rec('compileShader'),
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    deleteShader: rec('deleteShader'),
    createProgram: (..._a: unknown[]) => {
      calls.push('createProgram')
      return handle('program')
    },
    attachShader: rec('attachShader'),
    linkProgram: rec('linkProgram'),
    getProgramParameter: () => true,
    getProgramInfoLog: () => '',
    deleteProgram: rec('deleteProgram'),
    useProgram: rec('useProgram'),
    createVertexArray: (..._a: unknown[]) => {
      calls.push('createVertexArray')
      return handle('vao')
    },
    bindVertexArray: rec('bindVertexArray'),
    deleteVertexArray: rec('deleteVertexArray'),
    getUniformLocation: (..._a: unknown[]) => handle('loc'),
    uniform1f: rec('uniform1f'),
    uniform1i: rec('uniform1i'),
    uniform2f: rec('uniform2f'),
    uniform3f: rec('uniform3f'),
    uniform3fv: rec('uniform3fv'),
    drawArrays: rec('drawArrays'),
    viewport: rec('viewport'),
  }
  return gl as unknown as MockGLContext
}

// ---------------------------------------------------------------------------
// Observer mocks — capture the latest instance + its callback so tests can drive
// resize / intersection events and assert disconnect() on unmount.
// ---------------------------------------------------------------------------

export class MockResizeObserver {
  cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb
    harness.lastResizeObserver = this
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

export class MockIntersectionObserver {
  cb: IntersectionObserverCallback
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
    harness.lastIntersectionObserver = this
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

// ---------------------------------------------------------------------------
// Deterministic rAF queue + shared harness state
// ---------------------------------------------------------------------------

let rafCallbacks: FrameRequestCallback[] = []

/** Run one round of queued rAF callbacks. The loop re-queues the next frame, so
 *  each flush advances exactly one frame; call it N times for N frames. Uses a
 *  timestamp of 0 so dt stays 0 (matches the pre-extraction `drainRaf`, and keeps
 *  the fps sampler from firing a stray setState outside act()). */
export function flushRaf() {
  const cbs = rafCallbacks
  rafCallbacks = []
  cbs.forEach((cb) => cb(0))
}

/** Mutable handles tests read/write to control the shared stubs. */
export const harness: {
  lastContextArgs: unknown[]
  lastResizeObserver: MockResizeObserver | null
  lastIntersectionObserver: MockIntersectionObserver | null
  reducedMotion: boolean
} = {
  lastContextArgs: [],
  lastResizeObserver: null,
  lastIntersectionObserver: null,
  reducedMotion: false,
}

// ---------------------------------------------------------------------------
// Install the global stubs (once per test file, since setupFiles re-run per file)
// ---------------------------------------------------------------------------

HTMLCanvasElement.prototype.getContext = function getContext(...args: unknown[]) {
  harness.lastContextArgs = args
  return args[0] === '2d' ? make2DContext() : makeGLContext()
} as unknown as typeof HTMLCanvasElement.prototype.getContext

globalThis.matchMedia = ((query: string) => ({
  matches: harness.reducedMotion && query.includes('reduced-motion'),
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent() {
    return false
  },
})) as unknown as typeof window.matchMedia

// jsdom ships no ImageData constructor — the accreting 2D diversions (sand-stroke,
// substrate) blit a CSS-px buffer through `new ImageData(buf, w, h)`. Minimal stand-in.
if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataPolyfill {
    data: Uint8ClampedArray
    width: number
    height: number
    colorSpace: PredefinedColorSpace = 'srgb'
    constructor(a: Uint8ClampedArray | number, b: number, c?: number) {
      if (a instanceof Uint8ClampedArray) {
        this.data = a
        this.width = b
        this.height = c ?? a.length / 4 / b
      } else {
        this.width = a
        this.height = b
        this.data = new Uint8ClampedArray(a * b * 4)
      }
    }
  }
  globalThis.ImageData = ImageDataPolyfill as unknown as typeof ImageData
}

globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
globalThis.IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver

globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
  rafCallbacks.push(cb)) as typeof requestAnimationFrame
globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame

beforeEach(() => {
  harness.lastContextArgs = []
  harness.lastResizeObserver = null
  harness.lastIntersectionObserver = null
  harness.reducedMotion = false
  rafCallbacks = []
})
