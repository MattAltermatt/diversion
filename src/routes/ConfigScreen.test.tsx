import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest'
import { render, act, fireEvent } from '@testing-library/react'
import {
  MemoryRouter,
  Routes,
  Route,
  createMemoryRouter,
  RouterProvider,
} from 'react-router-dom'
import { ConfigScreen } from './ConfigScreen'
import { Root } from '../App'
import { loadDiversion } from '../framework/registry'
import { flushRaf } from '../test-setup'

// See PlayScreen.test.tsx: `useDiversion` suspends on a cold slug since #288, and
// these tests render with no Suspense boundary and assert synchronously.
beforeAll(async () => {
  await Promise.all(['flow-field', 'particle-life'].map(loadDiversion))
})

function renderAt(entries: string[]) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/d/:slug" element={<ConfigScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ConfigScreen URL hydration', () => {
  it('initialises the form from the URL params', () => {
    renderAt(['/d/flow-field?particles=1000'])
    const particles = document.querySelector('input[type="range"]') as HTMLInputElement
    expect(particles.value).toBe('1000')
  })

  it('shows an animate pill linking to the play route with the current config', () => {
    const { getByText } = renderAt(['/d/flow-field?particles=1000'])
    const pill = getByText('animate →').closest('a') as HTMLAnchorElement
    expect(pill).not.toBeNull()
    expect(pill.getAttribute('href')).toContain('/d/flow-field/play')
    expect(pill.getAttribute('href')).toContain('particles=1000')
  })
})

// ── The data-router harness ─────────────────────────────────────────────────
//
// The three suites below need the REAL router shape, not MemoryRouter: <Root/>
// carries <ScrollRestoration/> (which only exists in a data router), and the
// navigate() a data router hands back is the async `useNavigateStable` one whose
// failure mode is a rejected promise rather than a sync throw. Getting either of
// those wrong makes the guard pass for the wrong reason.
function makeRouter(entries: string[], initialIndex?: number) {
  return createMemoryRouter(
    [{ element: <Root />, children: [{ path: '/d/:slug', element: <ConfigScreen /> }] }],
    { initialEntries: entries, initialIndex },
  )
}

const range = () => document.querySelector('input[type="range"]') as HTMLInputElement

// No @types/node in this project (the app is browser-only), but the runner IS Node
// and an unhandled promise rejection is a run-level failure there — which is exactly
// the signal one of the tests below needs to read.
const nodeProcess = (
  globalThis as unknown as {
    process: {
      on(event: 'unhandledRejection', fn: (reason: unknown) => void): void
      off(event: 'unhandledRejection', fn: (reason: unknown) => void): void
    }
  }
).process

/** One `input` event on the Particles slider — exactly what a drag emits per frame. */
function drag(to: number) {
  fireEvent.change(range(), { target: { value: String(to) } })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ── #301 ────────────────────────────────────────────────────────────────────
describe('ConfigScreen first-load double build (#301)', () => {
  it('builds the world exactly once, with one seed, on a direct load', async () => {
    // `useNavigationType()` reports 'POP' for an INITIAL page load, not only for
    // back/forward — so the re-decode effect used to fire on the very first pass and
    // roll a second seed over the one the useState initializer had just rolled. The
    // first world was built and thrown away inside the same passive-effect flush,
    // which is why nothing ever flickered and nothing ever caught it.
    const flowField = (await loadDiversion('flow-field'))!
    const setup = vi.spyOn(flowField, 'setup')

    const router = makeRouter(['/d/flow-field'])
    await act(async () => {
      render(<RouterProvider router={router} />)
    })

    // Seeds first: the symptom is not just "twice", it is "twice with two different
    // worlds", and that is the assertion a future reader should see fail.
    const seeds = setup.mock.calls.map((c) => (c[1] as { seed: number }).seed)
    expect(new Set(seeds).size).toBe(1)
    expect(setup).toHaveBeenCalledTimes(1)
  })

  it('still re-decodes the URL on a genuine back/forward', async () => {
    // The guard must skip the FIRST run only — the effect exists so that browser
    // back/forward moves the form, and losing that would be a worse bug than #301.
    const router = makeRouter(
      ['/d/flow-field?particles=1000', '/d/flow-field?particles=2000'],
      1,
    )
    await act(async () => {
      render(<RouterProvider router={router} />)
    })
    expect(range().value).toBe('2000')

    await act(async () => {
      await router.navigate(-1)
    })
    expect(router.state.historyAction).toBe('POP')
    expect(range().value).toBe('1000')
  })
})

// ── #302 ────────────────────────────────────────────────────────────────────
describe('ConfigScreen scroll reset on edit (#302)', () => {
  it('never scrolls the page while the form is being edited', async () => {
    // <ScrollRestoration/>'s restore layout-effect keys on the location, and `replace`
    // mints a NEW location key per call — so every slider tick fell through to
    // window.scrollTo(0, 0). Pinned at 0 and invisible above 820px; below it (#284
    // made the Config screen scroll) the phone teleports to the top of the form on
    // the first tick and stays there for the whole drag.
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)

    const router = makeRouter(['/d/flow-field?particles=1000'])
    await act(async () => {
      render(<RouterProvider router={router} />)
    })
    scrollTo.mockClear() // the mount's own restore is not what this guards

    // Flush between events so every one of them reaches the history, rather than
    // being coalesced by #303's throttle into a single write this test would pass
    // vacuously against.
    for (let i = 1; i <= 20; i++) {
      drag(1000 + i)
      await act(async () => {
        flushRaf()
      })
    }

    expect(router.state.location.search).toContain('particles=1020')
    expect(scrollTo).not.toHaveBeenCalled()
  })
})

// ── #303 ────────────────────────────────────────────────────────────────────
describe('ConfigScreen URL write throttling (#303)', () => {
  it('coalesces a drag to one history write per frame, carrying the last value', async () => {
    // WebKit rate-limits history.replaceState to 100 calls per 10s and then THROWS,
    // and a slider drag emitted one call per input event (60–120/s) — so ~1s of
    // scrubbing froze the URL for the rest of the session, and "Copy link" / reload
    // handed back the pre-freeze config.
    const router = makeRouter(['/d/flow-field?particles=1000'])
    await act(async () => {
      render(<RouterProvider router={router} />)
    })
    const navigate = vi.spyOn(router, 'navigate')

    for (let i = 1; i <= 40; i++) drag(1000 + i)
    expect(navigate).not.toHaveBeenCalled() // trailing edge: nothing written yet

    await act(async () => {
      flushRaf()
    })

    expect(navigate).toHaveBeenCalledTimes(1)
    // …and the one write that happened carries the value the drag ENDED on, not the
    // first one — a throttle that drops the trailing edge would leave the URL a
    // frame behind forever.
    expect(router.state.location.search).toContain('particles=1040')
  })

  it('keeps the preview synchronous — the state write is never deferred', async () => {
    // The throttle is on the URL only. There is deliberately no debounce between a
    // slider and the diversion's update(), so the control must move on the event,
    // with no frame flushed.
    const router = makeRouter(['/d/flow-field?particles=1000'])
    await act(async () => {
      render(<RouterProvider router={router} />)
    })
    drag(1234)
    expect(range().value).toBe('1234')
  })

  it('DROPS a pending write on unmount rather than landing it on the next route', async () => {
    // This started life as "flush on unmount so the last edit is never lost", which
    // sounds protective and is the opposite. `navigate({search})` carries no pathname
    // and react-router resolves that against router.state.location AT CALL TIME; an
    // unmount cleanup runs after the route change has committed, so the flush wrote
    // this screen's ~340-char query onto whatever the app had just navigated to —
    // and on a POP it REPLACED the pop target's own search, so reloading that history
    // entry decoded mostly defaults. Nothing reads this URL: playHref and
    // CopyLinkButton both render from the synchronous `config` state.
    const router = makeRouter(['/d/flow-field?particles=1000'], 0)
    await act(async () => {
      render(<RouterProvider router={router} />)
    })
    drag(1777) // queued for a frame that never comes
    await act(async () => {
      await router.navigate('/')
    })
    await act(async () => {
      flushRaf() // and the cancelled frame must stay cancelled
    })
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search).toBe('') // no foreign config query
  })

  it('leaves an unrelated history entry untouched when the drag is abandoned', async () => {
    // particle-life, not an arbitrary slug: it is preloaded in beforeAll, and a Back
    // target is warm by definition — you can only go back to a config you have already
    // opened. A cold slug SUSPENDS, the render never commits, and the effect that
    // guards this never runs (which is why writeSearch carries a second, commit-free
    // guard for real browsers).
    const router = makeRouter(
      ['/d/particle-life?count=900', '/d/flow-field?particles=1000'],
      1,
    )
    await act(async () => {
      render(<RouterProvider router={router} />)
    })
    drag(1777)
    await act(async () => {
      await router.navigate(-1) // browser Back, mid-drag
    })
    await act(async () => {
      flushRaf()
    })
    expect(router.state.location.pathname).toBe('/d/particle-life')
    expect(router.state.location.search).toBe('?count=900') // its own, intact
    expect(router.state.location.search).not.toContain('particles')
  })

  it('survives a refused history write and keeps taking edits', async () => {
    // The failure mode this guards is a REJECTION, not a sync throw: a data router's
    // navigate() awaits router.navigate, so WebKit's SecurityError comes back as an
    // unhandled promise rejection that would surface as a run-level error.
    const rejections: unknown[] = []
    const onRejection = (e: unknown) => rejections.push(e)
    nodeProcess.on('unhandledRejection', onRejection)
    try {
      const router = makeRouter(['/d/flow-field?particles=1000'])
      await act(async () => {
        render(<RouterProvider router={router} />)
      })

      const navigate = vi.spyOn(router, 'navigate').mockImplementation(() => {
        throw new DOMException(
          'Attempt to use history.replaceState() more than 100 times per 10 seconds',
          'SecurityError',
        )
      })
      drag(1500)
      await act(async () => {
        flushRaf()
      })
      expect(navigate).toHaveBeenCalledTimes(1)
      // Let the rejection, if any, reach Node's handler.
      await new Promise((r) => setTimeout(r, 0))
      expect(rejections).toHaveLength(0)

      // The refusal is transient — the next frame's write must still land, and the
      // form must still be live.
      navigate.mockRestore()
      drag(1600)
      await act(async () => {
        flushRaf()
      })
      expect(range().value).toBe('1600')
      expect(router.state.location.search).toContain('particles=1600')
    } finally {
      nodeProcess.off('unhandledRejection', onRejection)
    }
  })
})
