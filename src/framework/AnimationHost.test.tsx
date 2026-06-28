import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { z } from 'zod'
import { AnimationHost } from './AnimationHost'
import type { Diversion } from './types'

// jsdom has no GL/2D context or rAF — stub them so the host's effect runs.
// Record getContext args so the WebGL-attributes test can assert them.
let lastContextArgs: unknown[] = []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lastResizeObserver: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lastIntersectionObserver: any = null
let rafCbs: FrameRequestCallback[] = []
let reducedMotion = false
// Drive one round of queued rAF callbacks (each re-queues the next frame).
function drainRaf() {
  const cbs = rafCbs
  rafCbs = []
  cbs.forEach((cb) => cb(0))
}
beforeEach(() => {
  lastContextArgs = []
  lastResizeObserver = null
  lastIntersectionObserver = null
  rafCbs = []
  reducedMotion = false
  HTMLCanvasElement.prototype.getContext = vi.fn((...args: unknown[]) => {
    lastContextArgs = args
    return {
      setTransform() {},
      fillRect() {},
      viewport() {},
      drawingBufferWidth: 300,
      drawingBufferHeight: 150,
    }
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCbs.push(cb)
    return rafCbs.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reducedMotion && q.includes('reduced-motion'),
    addEventListener() {},
    removeEventListener() {},
  }))
  // jsdom lacks ResizeObserver — capture the callback so tests can drive it.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb
        lastResizeObserver = this
      }
      observe() {}
      disconnect() {}
    },
  )
  // jsdom lacks IntersectionObserver — capture the callback so tests can drive it.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      cb: IntersectionObserverCallback
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb
        lastIntersectionObserver = this
      }
      observe() {}
      disconnect() {}
    },
  )
})

function makeDiv(calls: string[], updateReturns: boolean): Diversion {
  return {
    id: 'fake',
    title: 'Fake',
    description: '',
    kind: '2d',
    schema: z.object({ v: z.number().default(0) }),
    setup: () => {
      calls.push('setup')
      return { s: 1 }
    },
    frame: () => {
      calls.push('frame')
    },
    resize: () => {
      calls.push('resize')
    },
    update: () => {
      calls.push('update')
      return updateReturns
    },
  }
}

function makeWebglDiv(calls: string[]): Diversion {
  return {
    id: 'glfake',
    title: 'GLFake',
    description: '',
    kind: 'webgl',
    schema: z.object({ v: z.number().default(0) }),
    setup: () => {
      calls.push('setup')
      return { s: 1 }
    },
    frame: () => {},
  }
}

describe('AnimationHost WebGL host (#8)', () => {
  it('creates webgl2 with sane context attributes', () => {
    render(<AnimationHost diversion={makeWebglDiv([])} config={{ v: 0 }} />)
    expect(lastContextArgs[0]).toBe('webgl2')
    expect(lastContextArgs[1]).toMatchObject({ alpha: false, powerPreference: 'high-performance' })
  })

  it('preventDefaults webglcontextlost (so restore can fire)', () => {
    const { container } = render(<AnimationHost diversion={makeWebglDiv([])} config={{ v: 0 }} />)
    const canvas = container.querySelector('canvas')!
    const lost = new Event('webglcontextlost', { cancelable: true })
    canvas.dispatchEvent(lost)
    expect(lost.defaultPrevented).toBe(true)
  })

  it('re-runs setup on webglcontextrestored', () => {
    const calls: string[] = []
    const { container } = render(<AnimationHost diversion={makeWebglDiv(calls)} config={{ v: 0 }} />)
    expect(calls).toEqual(['setup'])
    const canvas = container.querySelector('canvas')!
    canvas.dispatchEvent(new Event('webglcontextrestored'))
    expect(calls).toEqual(['setup', 'setup'])
  })
})

describe('AnimationHost lifecycle', () => {
  it('calls setup once on mount, update (not setup) on config change', () => {
    const calls: string[] = []
    const div = makeDiv(calls, true)
    const { rerender } = render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    expect(calls).toEqual(['setup'])
    rerender(<AnimationHost diversion={div} config={{ v: 1 }} />)
    expect(calls).toEqual(['setup', 'update'])
  })

  it('re-runs setup when update returns false', () => {
    const calls: string[] = []
    const div = makeDiv(calls, false)
    const { rerender } = render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    rerender(<AnimationHost diversion={div} config={{ v: 1 }} />)
    expect(calls).toEqual(['setup', 'update', 'setup'])
  })
})

describe('AnimationHost reduced-motion (#39)', () => {
  it('animates freely when reduced-motion is off', () => {
    const calls: string[] = []
    render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    drainRaf()
    drainRaf()
    drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBeGreaterThan(1)
  })

  it('paints exactly one frame then freezes when reduced-motion is on', () => {
    reducedMotion = true
    const calls: string[] = []
    render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    drainRaf()
    drainRaf()
    drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBe(1)
  })

  it('shows a visible opt-in chip + ▶ icon, and a single click resumes motion', () => {
    reducedMotion = true
    const calls: string[] = []
    const { container } = render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    act(() => drainRaf()) // paint first frame → reduced gate engages + chip renders
    expect(container.querySelector('.anim-hint')?.textContent).toContain('Reduced motion')
    const btn = container.querySelector('.anim-bar button') as HTMLButtonElement
    expect(btn.getAttribute('aria-label')).toBe('Play') // ▶, not a misleading ⏸
    const before = calls.filter((c) => c === 'frame').length
    fireEvent.click(btn) // single click = opt in
    drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBeGreaterThan(before)
  })
})

describe('AnimationHost offscreen pause (#6)', () => {
  it('stops animating when scrolled out of view, resumes when back', () => {
    const calls: string[] = []
    render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    drainRaf()
    const baseline = calls.filter((c) => c === 'frame').length
    lastIntersectionObserver.cb([{ isIntersecting: false }], lastIntersectionObserver)
    drainRaf()
    drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBe(baseline) // frozen
    lastIntersectionObserver.cb([{ isIntersecting: true }], lastIntersectionObserver)
    drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBeGreaterThan(baseline) // resumed
  })
})

describe('AnimationHost resize (#7)', () => {
  it('refits via ResizeObserver, passing the context to resize()', () => {
    const calls: string[] = []
    render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    expect(lastResizeObserver).not.toBeNull()
    lastResizeObserver.cb([], lastResizeObserver) // fire a resize
    expect(calls).toContain('resize')
  })
})
