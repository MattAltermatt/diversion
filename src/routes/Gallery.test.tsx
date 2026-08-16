import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Gallery, LazyPreview } from './Gallery'
import { listDiversions, peekDiversion } from '../framework/registry'
import { acquireGpuSlot, _resetGpuBudget } from '../framework/gpuBudget'
import { harness } from '../test-setup'

// Gallery went from "render 137 fully-loaded diversions" to "render 137 metadata
// cards, each fetching its own chunk when it settles near the viewport" (#288), which
// put the branch's most intricate async logic on the app's front door — and it had no
// test at all. These cover the parts that can regress silently.
//
// NOTE the setup file installs a MockIntersectionObserver, so `near` starts FALSE and
// nothing fetches until a test drives the observer. (LazyPreview's "no
// IntersectionObserver → render eagerly" fallback is therefore NOT what runs here.)
// The mock records only the most recent observer, i.e. the last tile's — which is all
// these need, and is honest about only exercising one tile's load path.

function renderGallery() {
  return render(
    <MemoryRouter>
      <Gallery />
    </MemoryRouter>,
  )
}

/** Drive the last-constructed tile observer into view, then clear the 160ms mount
 *  debounce so `near` actually flips. */
async function settleLastTileIntoView() {
  const io = harness.lastIntersectionObserver
  expect(io).toBeTruthy() // non-vacuity: no observer means no tile ever mounted one
  await act(async () => {
    io!.cb([{ isIntersecting: true } as IntersectionObserverEntry], io as never)
    await new Promise((r) => setTimeout(r, 250)) // > the 160ms debounce
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Gallery', () => {
  it('renders a card for every diversion from METADATA, before any code loads', () => {
    // The whole point of the split: the grid is complete on the first paint. If this
    // ever needs an await, the metadata has stopped being eager.
    renderGallery()
    const metas = listDiversions()
    expect(metas.length).toBeGreaterThan(100) // 137 today; guards against a broken glob
    for (const m of [metas[0], metas[Math.floor(metas.length / 2)], metas.at(-1)!]) {
      expect(screen.getByText(m.title)).toBeTruthy()
    }
    expect(screen.getAllByRole('link')).toHaveLength(metas.length)
  })

  it('links each card at its diversion route', () => {
    renderGallery()
    const first = listDiversions()[0]
    const link = screen.getByText(first.title).closest('a')
    expect(link?.getAttribute('href')).toBe(`/d/${first.id}`)
  })

  it('FETCHES NOTHING until a tile scrolls near', async () => {
    // The saving grace of the whole design: 137 cards render, zero chunks fetch.
    //
    // Asserts on the REGISTRY, not on the absence of a canvas. A canvas is also
    // absent when `near` is false for the unrelated reason that `show` gates on it,
    // so "no canvas" passes even if every tile is downloading — which is exactly the
    // regression that matters. `peekDiversion` going warm is the only honest witness
    // that a fetch happened.
    // Counts how many of the 137 went warm rather than watching one id, because a
    // single id is order-dependent across tests in this file — and because the
    // regression's signature is precisely "all of them loaded".
    // An ABSOLUTE bound, not a before/after delta: the registry cache is module state
    // shared by every test in this file, so a delta is trivially satisfied when an
    // earlier test already warmed everything — which is exactly what the regression
    // would cause. The bound is what makes this non-vacuous.
    // 1200ms, not 400: an ungated fetch takes ~800ms to warm all 137 in jsdom, so a
    // shorter window let the regression slip through while the test still passed.
    const warm = () => listDiversions().filter((m) => peekDiversion(m.id)).length
    renderGallery()
    await new Promise((r) => setTimeout(r, 1200))
    expect(warm()).toBeLessThan(5) // only tiles other tests deliberately settled
    expect(document.querySelector('.anim-canvas')).toBeNull()
  }, 15_000)

  it('fetches and mounts a preview once a tile settles near the viewport', async () => {
    renderGallery()
    const lastId = listDiversions().at(-1)!.id
    expect(peekDiversion(lastId)).toBeUndefined() // cold before

    await settleLastTileIntoView()

    // No canvas exists until the module has actually loaded — that transition is the
    // new `show = near && (!isGpu || slot) && !!mod` gate.
    await waitFor(() => expect(document.querySelector('.anim-canvas')).toBeTruthy(), {
      timeout: 10_000,
    })
    // Warm afterwards, i.e. it genuinely went through loadDiversion.
    expect(peekDiversion(lastId)).toBeDefined()
  }, 15_000)

  it('survives being unmounted mid-fetch', async () => {
    // Deliberately a WEAK claim, because the strong one is not observable: React 19
    // no longer warns when setState lands on an unmounted component, so removing the
    // `live` guard in the fetch effect changes nothing a test can see (verified by
    // mutation — the guard's removal passes every assertion here). The guard stays as
    // hygiene; this only pins that unmounting mid-flight doesn't throw.
    const { unmount } = renderGallery()
    const io = harness.lastIntersectionObserver!
    await act(async () => {
      io.cb([{ isIntersecting: true } as IntersectionObserverEntry], io as never)
      await new Promise((r) => setTimeout(r, 200)) // debounce fires; import in flight
    })
    expect(() => unmount()).not.toThrow()
    await new Promise((r) => setTimeout(r, 400)) // import resolves into a dead tile
  })

  it('a GPU tile claims no context slot until its code has arrived', async () => {
    // Regression guard for the review finding: the slot effect used to key on
    // [isGpu, near] alone, so a GPU tile grabbed one of only 6 slots the instant it
    // settled near and held it across the whole chunk round-trip while rendering
    // nothing — and forever if the fetch failed, since `mod` then never changes.
    //
    // Fake timers make this deterministic: advancing past the 160ms debounce flips
    // `near` and runs the effects synchronously, while the dynamic import cannot
    // resolve (that needs a real microtask turn), so `mod` is guaranteed null at the
    // moment we measure.
    // Renders ONE chosen GPU tile rather than the whole gallery: the harness records
    // only the last-constructed observer, and the last tile alphabetically is a 2D
    // piece, so driving the gallery made this assertion vacuous.
    const gpu = listDiversions().find((m) => m.kind !== '2d')
    expect(gpu).toBeTruthy() // non-vacuity: there must BE a GPU diversion to test
    expect(peekDiversion(gpu!.id)).toBeUndefined() // and it must start COLD
    _resetGpuBudget()
    vi.useFakeTimers()
    try {
      render(
        <MemoryRouter>
          <LazyPreview meta={gpu!} />
        </MemoryRouter>,
      )
      const io = harness.lastIntersectionObserver!
      act(() => {
        io.cb([{ isIntersecting: true } as IntersectionObserverEntry], io as never)
        vi.advanceTimersByTime(250) // past the 160ms debounce → `near` flips
      })
      // `mod` is still null here: the dynamic import needs a real microtask turn,
      // which fake timers do not provide. All six slots must therefore still be free.
      const got = [0, 1, 2, 3, 4, 5].filter(() => acquireGpuSlot()).length
      expect(got).toBe(6)
    } finally {
      vi.useRealTimers()
      _resetGpuBudget()
    }
  })

  it('keeps the card readable when a tile is near but its code has not arrived', async () => {
    // A tile mid-fetch (or one whose chunk failed — the rejection is swallowed) must
    // stay the same dark placeholder it shows while waiting for a GPU slot, never a
    // blank row. Title and description stay readable throughout.
    const last = listDiversions().at(-1)!
    renderGallery()
    const io = harness.lastIntersectionObserver!
    act(() => {
      io.cb([{ isIntersecting: true } as IntersectionObserverEntry], io as never)
    })
    expect(screen.getByText(last.title)).toBeTruthy()
    expect(document.querySelectorAll('.tile-preview').length).toBe(listDiversions().length)
  })
})
