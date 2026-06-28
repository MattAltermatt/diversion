import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { z } from 'zod'
import { AnimationHost } from './AnimationHost'
import { DiversionErrorBoundary } from './DiversionErrorBoundary'
import type { Diversion } from './types'
// GL/2D context, matchMedia, observers and rAF are stubbed globally in test-setup.

describe('DiversionErrorBoundary (#124)', () => {
  it('shows the inline fallback for a tile whose setup() throws — app survives', () => {
    // React logs the caught error to console.error; silence it for a clean run.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const boom: Diversion = {
        id: 'boom',
        title: 'Boom',
        description: '',
        kind: 'webgl', // mimics a shader compile/link failure inside setup()
        schema: z.object({ v: z.number().default(0) }),
        setup: () => {
          throw new Error('shader compile failed')
        },
        frame: () => {},
      }
      const { container } = render(
        <DiversionErrorBoundary>
          <AnimationHost diversion={boom} config={{ v: 0 }} />
        </DiversionErrorBoundary>,
      )
      expect(container.querySelector('.diversion-error')?.textContent).toContain(
        'This diversion failed to start',
      )
    } finally {
      errSpy.mockRestore()
    }
  })

  it('renders children normally (canvas, no fallback) when setup() succeeds', () => {
    const ok: Diversion = {
      id: 'ok',
      title: 'Ok',
      description: '',
      kind: '2d',
      schema: z.object({ v: z.number().default(0) }),
      setup: () => ({}),
      frame: () => {},
    }
    const { container } = render(
      <DiversionErrorBoundary>
        <AnimationHost diversion={ok} config={{ v: 0 }} />
      </DiversionErrorBoundary>,
    )
    expect(container.querySelector('.diversion-error')).toBeNull()
    expect(container.querySelector('canvas')).not.toBeNull()
  })
})
