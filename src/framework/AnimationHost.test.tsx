import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { z } from 'zod'
import { AnimationHost } from './AnimationHost'
import type { Diversion } from './types'

// jsdom has no 2D context or rAF — stub both so the host's effect runs.
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    setTransform() {},
    fillRect() {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
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
