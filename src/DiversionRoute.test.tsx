import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DiversionRoute } from './App'

/** A child that throws during render, standing in for `useDiversion` rejecting when
 *  a diversion's chunk fails to fetch. The boundary cannot tell the two apart — both
 *  arrive as a thrown value during render. */
function Exploding(): never {
  throw new Error('Failed to fetch dynamically imported module')
}

describe('DiversionRoute (#292) — the route boundary is wired to RouteLoadError', () => {
  it('shows the route-level failure screen, not the one-tile inline note', () => {
    // React logs the caught error; silence it for a clean run.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(
        <MemoryRouter>
          <DiversionRoute>
            <Exploding />
          </DiversionRoute>
        </MemoryRouter>,
      )
      // The whole point of #292: a way forward...
      expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
      // ...and a way back.
      expect(screen.getByRole('link', { name: /all diversions/i })).toBeTruthy()
      // And NOT the boundary's default, which is sized for a single gallery tile and
      // offers nothing at all. Dropping the `fallback` prop is what this catches.
      expect(screen.queryByText(/failed to start/i)).toBeNull()
    } finally {
      errSpy.mockRestore()
    }
  })
})
