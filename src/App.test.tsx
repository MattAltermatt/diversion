import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom'
import { Root } from './App'

// Opening a diversion from deep in the gallery used to land you at the BOTTOM of
// its config form: the browser keeps the scroll offset across an SPA navigation,
// and once the small-screen Config layout made the document scrollable, that
// retained offset finally had somewhere to land (#284). It was invisible before
// only because `.config-screen` was `height: 100vh; overflow: hidden`.
//
// The guard is behavioural — mount the real Root (the layout that carries
// ScrollRestoration) and assert a forward navigation scrolls back to the top.
describe('scroll on navigation (#284)', () => {
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const routes = [
    {
      element: <Root />,
      children: [
        {
          path: '/',
          element: (
            <div style={{ height: 5000 }}>
              <Link to="/d/thing">open</Link>
            </div>
          ),
        },
        { path: '/d/thing', element: <div style={{ height: 3000 }}>config</div> },
      ],
    },
  ]

  it('scrolls to the top when navigating forward to a diversion', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    const { getByText } = render(<RouterProvider router={router} />)

    scrollTo.mockClear()
    await act(async () => {
      getByText('open').click()
    })

    expect(router.state.location.pathname).toBe('/d/thing')
    expect(scrollTo).toHaveBeenCalled()
    // (0, 0) — not a restored offset, because this history entry is brand new.
    expect(scrollTo.mock.calls.some(([x, y]) => x === 0 && y === 0)).toBe(true)
  })

  it('is wired through the layout route, not a per-screen effect', () => {
    // If ScrollRestoration is ever dropped from Root, the test above is the one
    // that fails — this one just states where the behaviour is meant to live, so
    // a future reader does not add a second, competing scroll-to-top.
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    const { unmount } = render(<RouterProvider router={router} />)
    expect(scrollTo).toHaveBeenCalled()
    unmount()
  })
})
