import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { getSharedDevice, __resetSharedDeviceForTests } from './webgpu'
import { Component, type ReactNode } from 'react'
import { z } from 'zod'
import { AnimationHost } from './AnimationHost'
import type { Diversion, Size } from './types'
// The GL/2D context, matchMedia, Resize/Intersection observers and the rAF queue
// are stubbed globally in src/test-setup.ts (#128). This file drives them through
// the shared `harness` + `flushRaf` rather than re-stubbing per file.
import { harness, flushRaf } from '../test-setup'

// Local alias kept so the existing assertions read unchanged.
const drainRaf = flushRaf

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
    expect(harness.lastContextArgs[0]).toBe('webgl2')
    expect(harness.lastContextArgs[1]).toMatchObject({
      alpha: false,
      powerPreference: 'high-performance',
    })
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

describe('AnimationHost WebGL context loss → pause source (#124)', () => {
  it('stays paused while the context is lost even when another pause source toggles', () => {
    const calls: string[] = []
    // A webgl diversion that records frames (makeWebglDiv's frame is a no-op).
    const div: Diversion = {
      id: 'glframes',
      title: '',
      description: '',
      kind: 'webgl',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => ({}),
      frame: () => {
        calls.push('frame')
      },
    }
    const { container } = render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    flushRaf()
    const baseline = calls.filter((c) => c === 'frame').length
    const canvas = container.querySelector('canvas')!

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    flushRaf()
    flushRaf()
    expect(calls.filter((c) => c === 'frame').length).toBe(baseline) // frozen on loss

    // A visibilitychange recomputes pause from the OTHER sources (all clear) — the
    // `lost` flag must keep the loop paused, NOT let frame() run on a dead context.
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    flushRaf()
    expect(calls.filter((c) => c === 'frame').length).toBe(baseline) // still frozen

    canvas.dispatchEvent(new Event('webglcontextrestored'))
    flushRaf()
    expect(calls.filter((c) => c === 'frame').length).toBeGreaterThan(baseline) // resumed
  })

  it('tears down before re-running setup on restore (teardown-before-setup invariant)', () => {
    const calls: string[] = []
    const div: Diversion = {
      id: 'glteardown',
      title: '',
      description: '',
      kind: 'webgl',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => {
        calls.push('setup')
        return {}
      },
      frame: () => {},
      teardown: () => {
        calls.push('teardown')
      },
    }
    const { container } = render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    expect(calls).toEqual(['setup'])
    container.querySelector('canvas')!.dispatchEvent(new Event('webglcontextrestored'))
    expect(calls).toEqual(['setup', 'teardown', 'setup'])
  })
})

describe('AnimationHost WebGPU device loss → rebuild (#300)', () => {
  // A controllable navigator.gpu, mirroring webgpu.test.ts's mock. The host does not
  // acquire the device itself (a webgpu diversion does that inside setup(), via
  // getSharedDevice) — it subscribes to the page-level loss signal, so the test only
  // needs A device to exist and then lose it.
  const origGpu = (navigator as { gpu?: unknown }).gpu
  let loseNow: () => void
  // Flip to make the NEXT acquisition fail — a GPU process that has not come back
  // yet, which is the common case immediately after a loss.
  let adapterGone = false

  const installGpu = () => {
    const requestDevice = async () => {
      let resolveLost!: (v: unknown) => void
      const lost = new Promise((res) => {
        resolveLost = res
      })
      loseNow = () => resolveLost({ reason: 'destroyed' })
      return { lost }
    }
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: async () => (adapterGone ? null : { requestDevice }) },
    })
  }

  const webgpuDiv = (calls: string[]): Diversion => ({
    id: 'gpufake',
    title: '',
    description: '',
    kind: 'webgpu',
    schema: z.object({ v: z.number().default(0) }),
    setup: () => {
      calls.push('setup')
      return {}
    },
    frame: () => {
      calls.push('frame')
    },
    teardown: () => {
      calls.push('teardown')
    },
  })

  // Let the loss run through webgpu.ts's `lost` chain AND the host's follow-up
  // getSharedDevice() (requestAdapter → requestDevice, each a microtask hop).
  const settle = async () => {
    for (let i = 0; i < 16; i++) await Promise.resolve()
  }

  beforeEach(() => {
    adapterGone = false
    __resetSharedDeviceForTests()
    installGpu()
  })
  afterEach(() => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: origGpu })
    __resetSharedDeviceForTests()
  })

  it('rebuilds through teardown→setup when the shared device is lost', async () => {
    const calls: string[] = []
    render(<AnimationHost diversion={webgpuDiv(calls)} config={{ v: 0 }} />)
    await getSharedDevice() // a device now exists to lose
    expect(calls).toEqual(['setup'])

    loseNow()
    await act(async () => {
      await settle()
    })
    // Same teardown-before-setup invariant the WebGL restore path upholds. Before
    // #300 nothing happened at all: the piece froze on its last frame while the
    // chrome kept counting fps, because a lost device silently no-ops per spec.
    expect(calls.filter((c) => c === 'setup' || c === 'teardown')).toEqual([
      'setup',
      'teardown',
      'setup',
    ])
  })

  it('draws with the REBUILT state afterwards, and leaves a WebGL host alone', async () => {
    // Frame count alone proves nothing here: an unfixed host also keeps ticking —
    // that is the bug, frames landing on a dead device as silent no-ops. What has
    // to change is WHICH state frame() receives.
    let generation = 0
    const drawn: number[] = []
    const glCalls: string[] = []
    const div: Diversion = {
      id: 'gpugen',
      title: '',
      description: '',
      kind: 'webgpu',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => ({ gen: ++generation }),
      frame: (state) => drawn.push((state as { gen: number }).gen),
    }
    render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    render(<AnimationHost diversion={makeWebglDiv(glCalls)} config={{ v: 0 }} />)
    await getSharedDevice()
    act(() => drainRaf())
    expect(drawn).toContain(1)

    loseNow()
    await act(async () => {
      await settle()
    })
    drawn.length = 0
    act(() => drainRaf())
    expect(drawn.length).toBeGreaterThan(0)
    expect(drawn.every((g) => g === 2)).toBe(true) // the post-loss world, not the dead one
    expect(glCalls.filter((c) => c === 'setup').length).toBe(1) // untouched by a GPU loss
  })

  // THE production failure shape. Every shipped webgpu diversion follows the
  // ready-flag pattern: setup() returns synchronously with ready:false and acquires
  // the device in a fire-and-forget tail whose .catch only console.warns. So a host
  // that clears `lost` when setup() RETURNS resumes the loop on a piece whose device
  // never came back — fps counting up over a frozen canvas with no pause source,
  // which is precisely the bug #300 is about. The synchronous-throw test below
  // cannot catch this: no shipped webgpu diversion throws out of setup().
  it('stays paused when the device does not come back (ready-flag diversion)', async () => {
    const drawn: string[] = []
    let sources: { lost: boolean } | null = null
    const div: Diversion = {
      id: 'gpuready',
      title: '',
      description: '',
      kind: 'webgpu',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => {
        const st = { ready: false }
        // The real pattern, swallowed .catch and all.
        void getSharedDevice()
          .then(() => {
            st.ready = true
          })
          .catch(() => {})
        return st
      },
      frame: (state) => {
        if ((state as { ready: boolean }).ready) drawn.push('frame')
      },
    }
    render(
      <TestBoundary>
        <AnimationHost
          diversion={div}
          config={{ v: 0 }}
          onPauseSourcesChange={(s) => {
            sources = s as { lost: boolean }
          }}
        />
      </TestBoundary>,
    )
    await act(async () => {
      await settle()
    })
    act(() => drainRaf())
    expect(drawn.length).toBeGreaterThan(0) // healthy before the loss

    adapterGone = true // the GPU process has not come back
    loseNow()
    await act(async () => {
      await settle()
    })
    drawn.length = 0
    act(() => drainRaf())
    act(() => drainRaf())
    expect(drawn).toEqual([]) // not drawing…
    expect(sources!.lost).toBe(true) // …and HONEST about it, rather than claiming recovery
  })

  it('surfaces a failed post-loss rebuild instead of freezing silently', async () => {
    let first = true
    const div: Diversion = {
      id: 'gpuboom',
      title: '',
      description: '',
      kind: 'webgpu',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => {
        if (first) {
          first = false
          return {}
        }
        throw new Error('no device')
      },
      frame: () => {},
    }
    const { container } = render(
      <TestBoundary>
        <AnimationHost diversion={div} config={{ v: 0 }} />
      </TestBoundary>,
    )
    await getSharedDevice()
    expect(container.querySelector('canvas')).not.toBeNull()
    loseNow()
    await act(async () => {
      await settle()
    })
    // A rebuild that cannot get a device re-throws through the same setSetupError
    // path the WebGL restore uses, so the boundary shows a fallback for THIS tile.
    // Asserting the boundary latched (not merely "no frames drew") keeps this from
    // passing vacuously — an unfixed host never rebuilds, so it never throws either.
    expect(container.querySelector('canvas')).toBeNull()
  })

  // Belt and braces, and deliberately so: the cleanup's unsubscribe and the
  // callback's runRef staleness check each cover this alone, so removing EITHER
  // leaves it green — it goes red only with both gone (verified). The notification
  // is page-level and its promise can resolve a tick late, which is exactly the
  // window where a rebuild would write state into a torn-down run.
  it('ignores a loss that lands after the host unmounted', async () => {
    const calls: string[] = []
    const { unmount } = render(<AnimationHost diversion={webgpuDiv(calls)} config={{ v: 0 }} />)
    await getSharedDevice()
    unmount()
    const after = [...calls]
    loseNow()
    await act(async () => {
      await settle()
    })
    expect(calls).toEqual(after) // no setup() writing state into a dead run
  })
})

describe('AnimationHost canvas remount on kind change (#124)', () => {
  it('mounts a FRESH canvas when the diversion kind flips 2d↔webgl', () => {
    // getContext() permanently locks a canvas to one context type, so reusing the
    // node across a 2d↔webgl switch returns null + blanks. key={kind} must remount.
    const { container, rerender } = render(
      <AnimationHost diversion={makeDiv([], true)} config={{ v: 0 }} />,
    )
    const first = container.querySelector('canvas')
    expect(first).not.toBeNull()
    rerender(<AnimationHost diversion={makeWebglDiv([])} config={{ v: 0 }} />)
    const second = container.querySelector('canvas')
    expect(second).not.toBeNull()
    expect(second).not.toBe(first) // keyed by kind → React replaced the DOM node
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
    harness.reducedMotion = true
    const calls: string[] = []
    render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    drainRaf()
    drainRaf()
    drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBe(1)
  })

  it('shows a visible opt-in chip + ▶ icon, and a single click resumes motion', () => {
    harness.reducedMotion = true
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

  it('freezes after one frame with the chip up and no unwrapped-act() warning', () => {
    harness.reducedMotion = true
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const calls: string[] = []
      const { container } = render(
        <AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />,
      )
      act(() => drainRaf()) // first frame paints inside act → gate engages, chip renders
      act(() => drainRaf()) // any further flush must NOT paint (frozen)
      expect(calls.filter((c) => c === 'frame').length).toBe(1)
      expect(container.querySelector('.anim-hint')?.textContent).toContain('Reduced motion')
      const actWarnings = errSpy.mock.calls.filter((c) => String(c[0]).includes('act('))
      expect(actWarnings).toEqual([])
    } finally {
      errSpy.mockRestore()
    }
  })
})

describe('AnimationHost static repaint when paused (#120)', () => {
  it('paints one static frame on a config edit while reduced-motion-frozen', () => {
    harness.reducedMotion = true
    const calls: string[] = []
    // Keep the SAME diversion instance across rerender so the [config] effect
    // (live update) runs — a new instance would re-run the whole [diversion] setup.
    const div = makeDiv(calls, true)
    const { rerender } = render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    act(() => drainRaf()) // first frame paints → reduced gate engages, loop frozen
    const before = calls.filter((c) => c === 'frame').length
    expect(before).toBe(1)
    // Editing config while frozen: update() runs but the frozen loop never
    // repaints, so the host must paint exactly one static frame (#120).
    act(() => rerender(<AnimationHost diversion={div} config={{ v: 1 }} />))
    expect(calls.filter((c) => c === 'update').length).toBe(1)
    expect(calls.filter((c) => c === 'frame').length).toBe(before + 1)
    // …and it stays frozen afterward (the static paint is one-shot, not a resume).
    act(() => drainRaf())
    expect(calls.filter((c) => c === 'frame').length).toBe(before + 1)
  })
})

describe('AnimationHost mounted while the tab is hidden (#298)', () => {
  // jsdom's `hidden` is a prototype getter, so override it as an own property.
  const setHidden = (v: boolean) =>
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => v })
  const restoreHidden = () => {
    // @ts-expect-error deleting the own override restores the prototype getter
    delete document.hidden
  }

  // ⚠️ Do NOT drain rAF while hidden in these tests. A real hidden tab delivers no
  // rAF callbacks at all — it PARKS them — and it is precisely that parked callback
  // meeting the resume's second one that forks the loop. The shared harness delivers
  // on demand regardless of visibility, so draining first would consume the parked
  // frame and defuse the bug: the first draft of this test passed against the
  // unfixed loop for exactly that reason.
  it('runs frame() ONCE per rAF turn after the tab is revealed', () => {
    harness.reducedMotion = false
    const calls: string[] = []
    setHidden(true) // ⌘-click from the gallery / restored session / prerender
    try {
      render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
      setHidden(false)
      act(() => document.dispatchEvent(new Event('visibilitychange')))
      act(() => drainRaf())
      // Two self-re-queuing chains (start() queued one while paused, setPaused(false)
      // queued another and overwrote the single handle) gave 2 here — and 2 on every
      // turn after, for the rest of the session.
      expect(calls.filter((c) => c === 'frame').length).toBe(1)
      act(() => drainRaf())
      expect(calls.filter((c) => c === 'frame').length).toBe(2)
      act(() => drainRaf())
      expect(calls.filter((c) => c === 'frame').length).toBe(3)
    } finally {
      restoreHidden()
    }
  })

  it('schedules NO rAF at all while hidden, so the page can idle', () => {
    harness.reducedMotion = false
    const calls: string[] = []
    setHidden(true)
    // Delegating spy: counts without replacing the harness queue.
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
    try {
      render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
      expect(rafSpy).not.toHaveBeenCalled()
    } finally {
      rafSpy.mockRestore()
      restoreHidden()
    }
  })
})

describe('AnimationHost static repaint clock (#310)', () => {
  it('hands a paused repaint the LOOP clock, not performance.now()', () => {
    harness.reducedMotion = true
    const times: number[] = []
    const div: Diversion = {
      id: 'clock',
      title: 'Clock',
      description: '',
      kind: '2d',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => ({ s: 1 }),
      frame: (_state, _ctx, t) => {
        times.push(t)
      },
      update: () => true,
    }
    const { rerender } = render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    act(() => drainRaf()) // one real frame; the reduced gate then freezes the loop
    // flushRaf stamps 0, so the loop's accumulated t is 0 while wall-clock time is not —
    // which is exactly what makes this assertion discriminating rather than vacuous.
    expect(performance.now()).toBeGreaterThan(0)
    act(() => rerender(<AnimationHost diversion={div} config={{ v: 1 }} />))
    expect(times.length).toBe(2) // the frozen loop repainted once for the edit
    expect(times[1]).toBe(0) // the loop's t — NOT ms since page load
  })
})

describe('AnimationHost offscreen pause (#6)', () => {
  it('stops animating when scrolled out of view, resumes when back', () => {
    const calls: string[] = []
    render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    drainRaf()
    const baseline = calls.filter((c) => c === 'frame').length
    const io = harness.lastIntersectionObserver!
    const ioArg = io as unknown as IntersectionObserver
    io.cb([{ isIntersecting: false }] as IntersectionObserverEntry[], ioArg)
    drainRaf()
    drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBe(baseline) // frozen
    io.cb([{ isIntersecting: true }] as IntersectionObserverEntry[], ioArg)
    drainRaf()
    expect(calls.filter((c) => c === 'frame').length).toBeGreaterThan(baseline) // resumed
  })
})

describe('AnimationHost resize (#7, #269)', () => {
  const rect = (w: number, h: number) =>
    ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect

  it('refits via ResizeObserver when the pixel size changes, passing the context to resize()', () => {
    harness.reducedMotion = false
    const calls: string[] = []
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(400, 300))
    try {
      render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
      expect(harness.lastResizeObserver).not.toBeNull()
      const ro = harness.lastResizeObserver!
      spy.mockReturnValue(rect(800, 600)) // the drawn box actually grew
      ro.cb([], ro)
      expect(calls).toContain('resize')
    } finally { spy.mockRestore() }
  })

  it('does NOT rebuild on a same-size RO reflow — size-equality guard (#269)', () => {
    harness.reducedMotion = false
    const calls: string[] = []
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(400, 300))
    try {
      render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
      const ro = harness.lastResizeObserver!
      calls.length = 0 // ignore the initial setup
      ro.cb([], ro) // same 400×300 → a reflow that changed nothing
      ro.cb([], ro)
      expect(calls).not.toContain('resize') // never nukes accumulated state on no-op reflow
    } finally { spy.mockRestore() }
  })

  it('paints one static frame when a PAUSED tile is resized (#269 / #120)', () => {
    harness.reducedMotion = true
    const calls: string[] = []
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(rect(400, 300))
    try {
      render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
      act(() => drainRaf()) // first frame paints → reduced gate engages, loop frozen
      const before = calls.filter((c) => c === 'frame').length
      const ro = harness.lastResizeObserver!
      spy.mockReturnValue(rect(800, 600))
      act(() => ro.cb([], ro)) // resize the frozen tile → canvas cleared by the size change
      expect(calls.filter((c) => c === 'resize').length).toBe(1)
      expect(calls.filter((c) => c === 'frame').length).toBe(before + 1) // one static repaint, not blank
    } finally {
      spy.mockRestore()
      harness.reducedMotion = false
    }
  })
})

describe('AnimationHost HiDPI sizing (#128)', () => {
  it('hands setup() the CSS-pixel size, not the device-pixel backing store', () => {
    // Stub a 400×300 CSS box at devicePixelRatio 2 → backing store should be
    // 800×600, but a 2D diversion must draw in CSS pixels (the sizeOf seam).
    const protoRect = HTMLCanvasElement.prototype.getBoundingClientRect
    HTMLCanvasElement.prototype.getBoundingClientRect = () =>
      ({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0 }) as DOMRect
    const prevDpr = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true })
    try {
      let captured: Size | null = null
      const div: Diversion = {
        id: 'sizefake',
        title: 'SizeFake',
        description: '',
        kind: '2d',
        schema: z.object({ v: z.number().default(0) }),
        setup: (_ctx, _cfg, size) => {
          captured = size
          return {}
        },
        frame: () => {},
      }
      const { container } = render(<AnimationHost diversion={div} config={{ v: 0 }} />)
      expect(captured).toEqual({ width: 400, height: 300 }) // CSS px, NOT 800×600
      const canvas = container.querySelector('canvas')!
      expect(canvas.width).toBe(800) // backing store IS device px
      expect(canvas.height).toBe(600)
    } finally {
      HTMLCanvasElement.prototype.getBoundingClientRect = protoRect
      Object.defineProperty(window, 'devicePixelRatio', { value: prevDpr, configurable: true })
    }
  })
})

describe('AnimationHost auto-restart seam', () => {
  it('reseeds via shouldRestart and reports a new live config', () => {
    harness.reducedMotion = false
    const schema = z.object({
      seed: z.number().int().default(1).meta({ randomizeOnFreshLoad: true }),
    })
    let setups = 0
    let restartOnce = true
    const seen: number[] = []
    const div: Diversion = {
      id: 'restartfake',
      title: '',
      description: '',
      kind: '2d',
      schema,
      setup: (_ctx, cfg) => {
        setups++
        return { seed: (cfg as { seed: number }).seed }
      },
      frame: () => {},
      shouldRestart: () => {
        const go = restartOnce
        restartOnce = false
        return go // fire exactly once → reseed, then quiescent
      },
    }
    const seen_push = (c: unknown) => seen.push((c as { seed: number }).seed)
    render(<AnimationHost diversion={div} config={{ seed: 1 }} onLiveConfigChange={seen_push} />)
    drainRaf() // tick a frame → shouldRestart fires the reseed
    expect(setups).toBeGreaterThanOrEqual(2) // initial setup + one reseed
    expect(seen[0]).toBe(1) // initial world reported on mount
    expect(seen.at(-1)).not.toBe(1) // reseed rolled a fresh random seed
  })

  it('never reseeds when shouldRestart is absent', () => {
    harness.reducedMotion = false
    let setups = 0
    const div: Diversion = {
      id: 'norestart',
      title: '',
      description: '',
      kind: '2d',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => {
        setups++
        return { s: 1 }
      },
      frame: () => {},
    }
    render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    drainRaf()
    drainRaf()
    expect(setups).toBe(1)
  })
})

describe('AnimationHost teardown frees resources (#128)', () => {
  it('calls teardown once and removes every listener/observer on unmount', () => {
    const calls: string[] = []
    const div: Diversion = {
      id: 'teardownfake',
      title: 'TeardownFake',
      description: '',
      kind: 'webgl', // webgl path also wires the context-lost/restored listeners
      schema: z.object({ v: z.number().default(0) }),
      setup: () => {
        calls.push('setup')
        return {}
      },
      frame: () => {},
      teardown: () => {
        calls.push('teardown')
      },
    }
    const { container, unmount } = render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    const canvas = container.querySelector('canvas')!
    const removeSpy = vi.spyOn(canvas, 'removeEventListener')
    const docRemoveSpy = vi.spyOn(document, 'removeEventListener')
    const roSpy = vi.spyOn(harness.lastResizeObserver!, 'disconnect')
    const ioSpy = vi.spyOn(harness.lastIntersectionObserver!, 'disconnect')

    unmount()

    expect(calls.filter((c) => c === 'teardown').length).toBe(1)
    expect(roSpy).toHaveBeenCalledTimes(1)
    expect(ioSpy).toHaveBeenCalledTimes(1)
    const removedEvents = removeSpy.mock.calls.map((c) => c[0])
    expect(removedEvents).toContain('webglcontextlost')
    expect(removedEvents).toContain('webglcontextrestored')
    expect(docRemoveSpy.mock.calls.map((c) => c[0])).toContain('visibilitychange')
  })
})

// Minimal boundary so an intentional setup()-throw is caught (mirrors DiversionErrorBoundary)
// instead of failing the test render — lets us assert on the teardown that ran underneath.
class TestBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? null : this.props.children }
}

describe('AnimationHost double-teardown guard (#266)', () => {
  it('does not teardown already-freed state when a re-setup setup() throws', () => {
    const calls: string[] = []
    let setups = 0
    const div: Diversion = {
      id: 'throwing-resetup',
      title: '', description: '', kind: '2d',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => {
        setups++
        calls.push('setup')
        if (setups === 2) throw new Error('re-setup boom') // the 2nd (re-)setup fails
        return { s: 1 }
      },
      frame: () => {},
      update: () => { calls.push('update'); return false }, // force a full re-setup on config change
      teardown: () => { calls.push('teardown') },
    }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { rerender, unmount } = render(
        <TestBoundary><AnimationHost diversion={div} config={{ v: 0 }} /></TestBoundary>,
      )
      expect(calls).toEqual(['setup'])
      // Config edit → update() returns false → teardown-then-setup; the setup() throws.
      // The teardown before it runs ONCE; run.state must be nulled so the effect-cleanup
      // (fired when the boundary unmounts the failed subtree) can't free it a 2nd time.
      act(() => rerender(<TestBoundary><AnimationHost diversion={div} config={{ v: 1 }} /></TestBoundary>))
      expect(calls.filter((c) => c === 'teardown').length).toBe(1) // exactly once, not twice
      unmount()
      expect(calls.filter((c) => c === 'teardown').length).toBe(1) // still once after full unmount
    } finally {
      errSpy.mockRestore()
    }
  })
})

describe('AnimationHost pointer seam (#9)', () => {
  function makePointerDiv(samples: unknown[]): Diversion {
    return {
      id: 'ptr', title: 'Ptr', description: '', kind: '2d',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => ({ s: 1 }),
      frame: () => {},
      onPointer: (_state, sample) => { samples.push(sample) },
    }
  }

  it('normalizes canvas pointer events into the diversion draw space', () => {
    const samples: any[] = []
    // jsdom returns a zero rect by default — give the canvas a real 200×100 box.
    const rectSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    const { container, unmount } = render(<AnimationHost diversion={makePointerDiv(samples)} config={{ v: 0 }} />)
    const canvas = container.querySelector('canvas')!

    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 25, buttons: 1 })
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 100, buttons: 0 })

    expect(samples).toHaveLength(2)
    // 2d draw space = CSS px (no DPR scaling); nx/ny are 0..1 across the box.
    expect(samples[0]).toMatchObject({ phase: 'down', x: 50, y: 25, nx: 0.25, ny: 0.25, buttons: 1 })
    // corner event clamps to 1,1.
    expect(samples[1]).toMatchObject({ phase: 'move', nx: 1, ny: 1 })
    rectSpy.mockRestore()
    unmount()
  })

  it('attaches no pointer listeners when a diversion omits onPointer', () => {
    const div: Diversion = {
      id: 'noptr', title: 'NoPtr', description: '', kind: '2d',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => ({ s: 1 }), frame: () => {},
    }
    const addSpy = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener')
    const { unmount } = render(<AnimationHost diversion={div} config={{ v: 0 }} />)
    const added = addSpy.mock.calls.map((c) => c[0])
    expect(added).not.toContain('pointerdown')
    addSpy.mockRestore()
    unmount()
  })
})
