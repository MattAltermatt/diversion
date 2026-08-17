import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'

// vi.mock is hoisted above every const in this file, so the spies have to be created
// inside the factory and read back through vi.mocked afterwards.
vi.mock('./offlineWarm', async () => {
  const actual = await vi.importActual<typeof import('./offlineWarm')>('./offlineWarm')
  return { ...actual, collectTargets: vi.fn(), warmAll: vi.fn() }
})

import { OfflineToggle } from './OfflineToggle'
import * as offlineWarm from './offlineWarm'
import { clearWarmed } from './offlineWarm'

const collectTargets = vi.mocked(offlineWarm.collectTargets)
const warmAll = vi.mocked(offlineWarm.warmAll)

const withServiceWorker = (present: boolean) => {
  if (present) Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
  else delete (navigator as unknown as Record<string, unknown>).serviceWorker
}

beforeEach(() => {
  clearWarmed()
  collectTargets.mockReset()
  warmAll.mockReset()
  withServiceWorker(true)
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
    expect(screen.getByText(/only the ones you have already watched/i)).toBeTruthy()
  })

  it('renders NOTHING where no service worker can store the result', () => {
    // Promising a durable offline copy with no SW would be a lie the control cannot
    // detect later.
    withServiceWorker(false)
    const { container } = render(<OfflineToggle />)
    expect(container.querySelector('.offline-ctl')).toBeNull()
  })

  it('shows live progress while warming, then confirms', async () => {
    collectTargets.mockResolvedValue({ urls: ['a', 'b', 'c', 'd'], fingerprint: 'fp:4' })
    warmAll.mockImplementation((async (_urls: string[], onProgress: (p: never) => void) => {
      onProgress({ done: 2, total: 4, failed: 0 } as never)
      return { done: 4, total: 4, failed: 0 }
    }) as never)

    render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })

    // 2.1 MB is ~11 s of downlink on a slow connection; a silent spinner reads broken.
    await waitFor(() => expect(screen.getByText(/works offline/i)).toBeTruthy())
  })

  it('offers a CANCEL while the download is in flight', async () => {
    collectTargets.mockResolvedValue({ urls: ['a'], fingerprint: 'fp:1' })
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
    collectTargets.mockResolvedValue({ urls: ['a'], fingerprint: 'fp:1' })
    warmAll.mockResolvedValue({ done: 1, total: 1, failed: 0 })

    render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })

    await waitFor(() => expect(warmAll).toHaveBeenCalled())
    expect(warmAll.mock.calls[0][2]).toBeInstanceOf(AbortSignal)
  })

  it('reports partial failures rather than claiming success', async () => {
    collectTargets.mockResolvedValue({ urls: ['a', 'b'], fingerprint: 'fp:2' })
    warmAll.mockResolvedValue({ done: 2, total: 2, failed: 1 })

    render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })

    await waitFor(() => expect(screen.getByText(/couldn’t be fetched/i)).toBeTruthy())
  })

  it('surfaces a failure to start rather than hanging on a bar', async () => {
    collectTargets.mockRejectedValue(new Error('nope'))

    render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })

    await waitFor(() => expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy())
  })

  it('offers an UPDATE once a copy has been taken', async () => {
    collectTargets.mockResolvedValue({ urls: ['a'], fingerprint: 'fp:1' })
    warmAll.mockResolvedValue({ done: 1, total: 1, failed: 0 })

    const { unmount } = render(<OfflineToggle />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /keep the gallery offline/i }))
    })
    await waitFor(() => expect(screen.getByText(/works offline/i)).toBeTruthy())
    unmount()

    // A fresh visit: the stored fingerprint is read back, so the control does not
    // offer the same multi-megabyte download as if nothing had happened.
    render(<OfflineToggle />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /update offline copy/i })).toBeTruthy(),
    )
  })
})
