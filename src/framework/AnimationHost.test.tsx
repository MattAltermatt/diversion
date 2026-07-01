import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
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

describe('AnimationHost resize (#7)', () => {
  it('refits via ResizeObserver, passing the context to resize()', () => {
    const calls: string[] = []
    render(<AnimationHost diversion={makeDiv(calls, true)} config={{ v: 0 }} />)
    expect(harness.lastResizeObserver).not.toBeNull()
    const ro = harness.lastResizeObserver!
    ro.cb([], ro) // fire a resize
    expect(calls).toContain('resize')
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
