import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RouteLoadError, reloadForFreshChunks } from './RouteLoadError'

const renderInRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RouteLoadError (#292)', () => {
  it('offers both directions out — a retry and a way back to the gallery', () => {
    renderInRouter(<RouteLoadError onRetry={() => {}} />)
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
    // The gallery is reachable even though this diversion's chunk is dead: every
    // diversion's identity ships in the entry bundle (#288), so listDiversions works.
    expect(screen.getByRole('link', { name: /all diversions/i }).getAttribute('href')).toBe('/')
  })

  it('is announced — a route that failed to load must not be a silent blank screen', () => {
    renderInRouter(<RouteLoadError onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('runs the retry handler on click', async () => {
    const onRetry = vi.fn()
    renderInRouter(<RouteLoadError onRetry={onRetry} />)
    screen.getByRole('button', { name: /try again/i }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('reloadForFreshChunks (#292)', () => {
  // location.reload is not spy-able on jsdom's real Location (non-configurable in
  // one jsdom and a no-op in another), so stub the whole global — same reason the
  // localStorage tests do.
  const stubLocation = () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    return reload
  }

  it('asks the service worker to update BEFORE reloading, so one press is enough', async () => {
    const reload = stubLocation()
    const update = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ update }) },
    })

    await reloadForFreshChunks()

    expect(update).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    // Order matters: reloading first would re-fetch the same stale precached
    // index.html and the button would need a second press.
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0])
  })

  it('reloads anyway when the update check REJECTS — a failed check must not strand the viewer', async () => {
    const reload = stubLocation()
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          update: vi.fn().mockRejectedValue(new Error('offline')),
        }),
      },
    })

    await reloadForFreshChunks()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads with no service worker at all (dev, or an unsupported browser)', async () => {
    const reload = stubLocation()
    vi.stubGlobal('navigator', {})

    await reloadForFreshChunks()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads when a service worker is supported but nothing is registered yet', async () => {
    const reload = stubLocation()
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    })

    await reloadForFreshChunks()

    expect(reload).toHaveBeenCalledTimes(1)
  })
})
