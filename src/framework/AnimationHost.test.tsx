import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { z } from 'zod'
import { AnimationHost } from './AnimationHost'
import type { Diversion } from './types'

// jsdom has no GL/2D context or rAF — stub them so the host's effect runs.
// Record getContext args so the WebGL-attributes test can assert them.
let lastContextArgs: unknown[] = []
beforeEach(() => {
  lastContextArgs = []
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
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
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
    frame: () => {},
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
