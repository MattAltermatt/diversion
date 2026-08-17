import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RouteLoadError, reloadForFreshChunks } from './RouteLoadError'

const renderInRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

/** jsdom's `navigator.onLine` is a getter on the prototype and always true. */
const withOnline = (value: boolean, run: () => void) => {
  const orig = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
  try {
    run()
  } finally {
    delete (navigator as unknown as Record<string, unknown>).onLine
    if (orig) Object.defineProperty(Navigator.prototype, 'onLine', orig)
  }
}

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

  it('runs the retry handler on click, then disables the button', () => {
    const onRetry = vi.fn()
    renderInRouter(<RouteLoadError onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    // A reload is not instant on a slow connection, and the SW update check in front
    // of it can take seconds. Without this the button looks dead and gets re-pressed.
    const busy = screen.getByRole('button', { name: /reloading/i }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
  })

  it('OFFLINE: says what is actually true, and never promises a reload will fix it', () => {
    // The other way to reach this screen, and the likelier one: the shell-only
    // precache (#289) boots the app offline but a piece never opened was never
    // runtime-cached. A reload cannot help — same shell, same missing chunk.
    withOnline(false, () => {
      renderInRouter(<RouteLoadError onRetry={() => {}} />)
      expect(screen.getByText(/offline/i)).toBeTruthy()
      expect(screen.queryByText(/reloading usually fixes it/i)).toBeNull()
      // The button stays: connectivity can return between render and press.
      expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
    })
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

  it('OFFLINE: skips the update check entirely and reloads straight away', async () => {
    const reload = stubLocation()
    const getRegistration = vi.fn()
    vi.stubGlobal('navigator', { onLine: false, serviceWorker: { getRegistration } })

    await reloadForFreshChunks()

    // The fetch cannot succeed offline; its only effect would be to sit on the
    // timeout while the viewer watches a disabled button.
    expect(getRegistration).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads anyway when the update check HANGS — a captive portal must not strand it', async () => {
    vi.useFakeTimers()
    try {
      const reload = stubLocation()
      vi.stubGlobal('navigator', {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue({ update: () => new Promise(() => {}) }),
        },
      })

      const done = reloadForFreshChunks()
      await vi.advanceTimersByTimeAsync(2000)
      await done

      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
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
