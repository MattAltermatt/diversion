import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PlayScreen } from './PlayScreen'

// Render PlayScreen at a play URL carrying encoded config, and read back the
// "← config" link's destination. The framework owns the rAF loop / canvas, so
// AnimationHost is harmless to mount in jsdom (it just won't paint).
function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/d/:slug/play" element={<PlayScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlayScreen back-link', () => {
  it('carries the current search params back to the config screen', () => {
    renderAt('/d/flow-field/play?particles=1000&speed=0.09')
    const back = screen.getByRole('link', { name: /config/i }) as HTMLAnchorElement
    // Regression for #2: clicking ← config must land on the configured form,
    // not reset to defaults — so the href must preserve the query string.
    expect(back.getAttribute('href')).toBe('/d/flow-field?particles=1000&speed=0.09')
  })

  it('points at the bare config route when there are no params', () => {
    renderAt('/d/flow-field/play')
    const back = screen.getByRole('link', { name: /config/i }) as HTMLAnchorElement
    expect(back.getAttribute('href')).toBe('/d/flow-field')
  })
})

describe('PlayScreen copy-link-with-seed', () => {
  it('offers a "copy this world" button whose link pins the live seed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    // particle-life has a randomizeOnFreshLoad seed → a seedless load rolls one, and
    // the pinned button must bake it into the copied URL.
    renderAt('/d/particle-life/play')
    const pinned = screen.getByRole('button', { name: /copy this world/i })
    await act(async () => {
      fireEvent.click(pinned)
    })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0][0]).toContain('seed=')
  })
})

// ── Screen Wake Lock (#284) ─────────────────────────────────────────────────
//
// A phone propped on a shelf sleeps in ~30s. These tests pin the two placement
// rules the whole design rests on: the lock belongs to this ROUTE (never to
// AnimationHost, which mounts on all 137 gallery tiles), and it is held iff
// `shouldPause` says the animation is actually moving — which is also what makes
// the tab-hide/show re-request fall out with no extra listener.

type FakeSentinel = EventTarget & { released: boolean; release: ReturnType<typeof vi.fn> }

function makeSentinel(): FakeSentinel {
  const s = new EventTarget() as FakeSentinel
  s.released = false
  s.release = vi.fn(() => {
    s.released = true
    s.dispatchEvent(new Event('release'))
    return Promise.resolve()
  })
  return s
}

/** Install a fake `navigator.wakeLock`. `reject` models the NotAllowedError the
 *  real API raises on a hidden document / low battery / blocking Permissions Policy. */
function installWakeLock({ reject = false } = {}) {
  const granted: FakeSentinel[] = []
  const request = vi.fn(() => {
    if (reject) return Promise.reject(new DOMException('denied', 'NotAllowedError'))
    const s = makeSentinel()
    granted.push(s)
    return Promise.resolve(s)
  })
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
  return { request, granted }
}

/** Drive `document.hidden` the way a real tab-hide does, and fire the event
 *  AnimationHost's pause model already listens for. */
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

const toggle = () => screen.getByRole('button', { name: /screen (awake|sleep)/i })

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock')
  Reflect.deleteProperty(document, 'hidden')
})

describe('PlayScreen wake lock', () => {
  it('does not render the toggle at all on a browser without the API', () => {
    Reflect.deleteProperty(navigator, 'wakeLock')
    renderAt('/d/flow-field/play')
    // A button that presses and silently does nothing is a defect, not graceful
    // degradation — `requestFullscreen` on iPhone is the cautionary example.
    expect(screen.queryByRole('button', { name: /screen (awake|sleep)/i })).toBeNull()
  })

  it('defaults OFF and requests a screen lock only once the viewer asks', async () => {
    const { request } = installWakeLock()
    renderAt('/d/flow-field/play')
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
    expect(request).not.toHaveBeenCalled() // battery is the viewer's call

    await act(async () => {
      fireEvent.click(toggle())
    })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('screen')
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
  })

  it('sits in the anim bar beside Pause/Fullscreen, inheriting the 44px touch target', () => {
    installWakeLock()
    renderAt('/d/flow-field/play')
    // Placement is load-bearing twice over: it puts the toggle with the other
    // playback controls, and `.anim-bar button` is the selector the narrow-viewport
    // rule grows to 44px. Rendering it in `.play-chrome` instead would miss both.
    const bar = toggle().closest('.anim-bar')
    expect(bar).not.toBeNull()
    expect(bar!.querySelector('button[aria-label="Pause"]')).not.toBeNull()
  })

  it('releases the lock when the viewer turns it back off', async () => {
    const { granted } = installWakeLock()
    renderAt('/d/flow-field/play')
    await act(async () => {
      fireEvent.click(toggle())
    })
    await act(async () => {
      fireEvent.click(toggle())
    })
    expect(granted[0].release).toHaveBeenCalled()
  })

  it('releases a lock that arrives after the viewer already changed their mind', async () => {
    // request() is async, so a sentinel can land after the effect that asked for it
    // was torn down. Without the cancelled branch that lock is held by nothing and
    // can never be released — the screen stays awake for the rest of the session.
    const { granted } = installWakeLock()
    renderAt('/d/flow-field/play')
    fireEvent.click(toggle()) // on
    fireEvent.click(toggle()) // …and off again, before the promise settles
    await act(async () => {})
    expect(granted).toHaveLength(1)
    expect(granted[0].release).toHaveBeenCalled()
  })

  it('drops the lock while the piece is paused, and takes it back on resume', async () => {
    // The whole point of keying off shouldPause: a frozen canvas is a still image,
    // and a still image has no claim on the battery.
    const { request, granted } = installWakeLock()
    renderAt('/d/flow-field/play')
    await act(async () => {
      fireEvent.click(toggle())
    })
    expect(request).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    })
    expect(granted[0].release).toHaveBeenCalled()
    expect(request).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('re-requests the lock when the tab comes back, since the platform drops it', async () => {
    // The re-request rides AnimationHost's existing `visibilitychange` listener via
    // the `hidden` pause source. No second listener exists, deliberately.
    const { request } = installWakeLock()
    renderAt('/d/flow-field/play')
    await act(async () => {
      fireEvent.click(toggle())
    })
    expect(request).toHaveBeenCalledTimes(1)

    setHidden(true)
    await act(async () => {})
    expect(request).toHaveBeenCalledTimes(1) // requesting on a hidden document rejects

    setHidden(false)
    await act(async () => {})
    expect(request).toHaveBeenCalledTimes(2)
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
  })

  it('fails soft and silent when the request is denied', async () => {
    // NotAllowedError is routine (hidden document, low battery, Permissions Policy)
    // and the viewer can do nothing about it — it must never reach a render.
    const { request } = installWakeLock({ reject: true })
    renderAt('/d/flow-field/play')
    await act(async () => {
      fireEvent.click(toggle())
    })
    expect(request).toHaveBeenCalledTimes(1)
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: /config/i })).toBeInTheDocument()
  })
})
