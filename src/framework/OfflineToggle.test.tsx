import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'

/** The control mirrors its state into a visually-hidden live region, so a text query
 *  legitimately matches twice. Assert on what is on SCREEN. */
const visibleText = (re: RegExp) =>
  screen.getAllByText(re).find((el) => !el.className.includes('visually-hidden'))
/** Absence variant: getAllByText throws when nothing matches, so it cannot express
 *  "this is not on screen". */
const noVisibleText = (re: RegExp) =>
  screen.queryAllByText(re).filter((el) => !el.className.includes('visually-hidden'))

// vi.mock is hoisted above every const in this file, so the spies have to be created
// inside the factory and read back through vi.mocked afterwards.
vi.mock('./offlineWarm', async () => {
  const actual = await vi.importActual<typeof import('./offlineWarm')>('./offlineWarm')
  return { ...actual, collectTargets: vi.fn(), warmAll: vi.fn(), verifyCached: vi.fn() }
})

import { OfflineToggle } from './OfflineToggle'
import * as offlineWarm from './offlineWarm'
import { clearWarmed } from './offlineState'

const collectTargets = vi.mocked(offlineWarm.collectTargets)
const warmAll = vi.mocked(offlineWarm.warmAll)
const verifyCached = vi.mocked(offlineWarm.verifyCached)

/** The #291 script publishes this; without it the control cannot warm anything. */
const publishAssets = (slugs: Record<string, (string | number)[]> = { a: ['assets/d/a-1.js'] }) => {
  ;(window as unknown as { __diversionAssets: unknown }).__diversionAssets = [[], slugs, []]
}

const withServiceWorker = (present: boolean) => {
  if (present) Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
  else delete (navigator as unknown as Record<string, unknown>).serviceWorker
}

beforeEach(() => {
  clearWarmed()
  collectTargets.mockReset()
  warmAll.mockReset()
  verifyCached.mockReset()
  verifyCached.mockResolvedValue(true)
  withServiceWorker(true)
  delete (window as unknown as Record<string, unknown>).__diversionAssets
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OfflineToggle (#293)', () => {
  it('offers the download with its size stated up front', () => {
    render(<OfflineToggle />)
    const btn = screen.getByRole('button', { name: /keep the gallery offline/i })
    // The cost is the whole reason this is opt-in rather than the default, so it is
    // never hidden behind the press.
    expect(btn.textContent).toMatch(/MB/)
  })

  it('says what it buys, since "offline" alone does not distinguish it from the default', () => {
    render(<OfflineToggle />)
    expect(visibleText(/only the ones you have already watched/i)).toBeTruthy()
  })

  it('renders NOTHING where no service worker can store the result', () => {
    // Promising a durable offline copy with no SW would be a lie the control cannot
    // detect later.
    withServiceWorker(false)
    const { container } = render(<OfflineToggle />)
    expect(container.querySelector('.offline-ctl')).toBeNull()
  })

  it('shows live progress while warming, then confirms', async () => {
    collectTargets.mockResolvedValue({ urls: ['a', 'b', 'c', 'd'], chunkCount: 4, fingerprint: 'fp:4' })
    warmAll.mockImplementation((async (_urls: string[], onProgress: (p: never) => void) => {
      onProgress({ done: 2, total: 4, failed: 0 } as never)
      return { done: 4, total: 4, failed: 0 }
    }) as never)

    render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })

    // ~1.6 MB is ~10 s of downlink on a slow connection; a silent spinner reads broken.
    await waitFor(() => expect(visibleText(/saved for offline/i)).toBeTruthy())
  })

  it('offers a CANCEL while the download is in flight', async () => {
    collectTargets.mockResolvedValue({ urls: ['a'], chunkCount: 1, fingerprint: 'fp:1' })
    let resolve: (v: unknown) => void = () => {}
    warmAll.mockImplementation(((_urls: string[], onProgress: (p: never) => void) =>
      new Promise((r) => {
        onProgress({ done: 0, total: 1, failed: 0 } as never)
        resolve = r as (v: unknown) => void
      })) as never)

    render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })

    const cancel = await screen.findByRole('button', { name: /cancel/i })
    await act(async () => {
      fireEvent.click(cancel)
      resolve({ done: 0, total: 1, failed: 0 })
    })

    // Back to the offer, not stuck mid-bar.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /keep the gallery offline/i })).toBeTruthy(),
    )
  })

  it('passes the abort signal down, so cancelling reaches the fetches', async () => {
    collectTargets.mockResolvedValue({ urls: ['a'], chunkCount: 1, fingerprint: 'fp:1' })
    warmAll.mockResolvedValue({ done: 1, total: 1, failed: 0 })

    render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })

    await waitFor(() => expect(warmAll).toHaveBeenCalled())
    expect(warmAll.mock.calls[0][2]).toBeInstanceOf(AbortSignal)
  })

  it('reports partial failures rather than claiming success', async () => {
    collectTargets.mockResolvedValue({ urls: ['a', 'b'], chunkCount: 2, fingerprint: 'fp:2' })
    warmAll.mockResolvedValue({ done: 2, total: 2, failed: 1 })

    render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })

    await waitFor(() => expect(visibleText(/couldn’t be fetched/i)).toBeTruthy())
    // ...and never a green tick over it.
    expect(screen.queryByText(/✓/)).toBeNull()
  })

  it('surfaces a failure to start rather than hanging on a bar', async () => {
    collectTargets.mockRejectedValue(new Error('nope'))

    render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })

    await waitFor(() => expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy())
  })

  it('refuses to claim success when NO diversion chunks were enumerated', async () => {
    // Reachable: an old cached index.html has no #291 script, so collectTargets finds
    // only the sprites. Warming those succeeds with zero failures, and without this
    // check the control prints a tick over an offline copy containing no pieces.
    collectTargets.mockResolvedValue({
      urls: ['/diversion/pictures/axe.png'],
      chunkCount: 0,
      fingerprint: ':0',
    })
    warmAll.mockResolvedValue({ done: 1, total: 1, failed: 0 })

    render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })

    await waitFor(() => expect(visibleText(/out of date/i)).toBeTruthy())
    expect(noVisibleText(/saved for offline/i)).toEqual([])
    expect(warmAll).not.toHaveBeenCalled()
  })

  it('refuses to claim success when nothing actually reached a cache', async () => {
    // No service worker controlling the document yet, or a quota eviction: the fetches
    // all succeed and nothing durable is stored.
    collectTargets.mockResolvedValue({ urls: ['a'], chunkCount: 1, fingerprint: 'fp:1' })
    warmAll.mockResolvedValue({ done: 1, total: 1, failed: 0 })
    verifyCached.mockResolvedValue(false)

    render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })

    await waitFor(() => expect(visibleText(/nothing could be stored/i)).toBeTruthy())
    expect(noVisibleText(/saved for offline/i)).toEqual([])
  })

  it('offers an UPDATE when the build has moved on since the copy was taken', async () => {
    // The deploy case, and the only moment the staleness check has any value: it must
    // resolve at MOUNT, from the published map, with no network.
    publishAssets({ a: ['assets/d/a-NEWHASH.js'] })
    collectTargets.mockResolvedValue({ urls: ['a'], chunkCount: 1, fingerprint: 'fp:old' })
    warmAll.mockResolvedValue({ done: 1, total: 1, failed: 0 })

    const { unmount } = render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })
    await waitFor(() => expect(visibleText(/saved for offline/i)).toBeTruthy())
    unmount()

    // A later visit, after a deploy moved every content hash.
    publishAssets({ a: ['assets/d/a-DIFFERENT.js'] })
    render(<OfflineToggle />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /update offline copy/i })).toBeTruthy(),
    )
    expect(visibleText(/has been updated since you saved it/i)).toBeTruthy()
  })

  it('names the progress bar', () => {
    // role=progressbar takes its name from the author only (4.1.2, Level A).
    render(<OfflineToggle />)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
